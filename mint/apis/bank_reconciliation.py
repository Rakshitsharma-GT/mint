import frappe
from frappe import _
import json
import datetime
from erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool import create_payment_entry_bts, create_journal_entry_bts
from erpnext.accounts.party import get_party_account
from erpnext import get_default_cost_center
from frappe.utils import flt # Import flt for safe comparisons

@frappe.whitelist()
def clear_clearing_date(voucher_type: str, voucher_name: str):
    """
        Clear the clearing date of a voucher
    """
    # using db_set to trigger notification
    payment_entry = frappe.get_doc(voucher_type, voucher_name)

    if payment_entry.has_permission("write"):
        payment_entry.db_set("clearance_date", None)


@frappe.whitelist()
def reconcile_vouchers(bank_transaction_name, vouchers, is_new_voucher: bool = False, data_source: str = 'Debtor'):
    """
    MODIFIED: Reconciles a statement entry with vouchers (Debtor Logic).
    """
    vouchers = json.loads(vouchers)

    if data_source == 'Debtor':
        # --- Debtor Logic ---
        
        transaction = frappe.get_doc("Debtor Statement Entry", bank_transaction_name)
        
        # Determine the total amount to allocate
        total_allocation_amount = sum(flt(v.get('amount')) for v in vouchers)

        # Validation
        if 0.0 >= transaction.unallocated_amount:
            frappe.throw(_("Debtor Statement Entry {0} is already fully allocated").format(transaction.name))
        
        if total_allocation_amount > flt(transaction.unallocated_amount):
            frappe.throw(_("Total allocation amount {0} exceeds the unallocated amount in the statement entry {1}").format(total_allocation_amount, transaction.unallocated_amount))

        # --- Get the CORRECT party account ---
        # FIX: Use get_party_account to get the specific receivable account for this party
        party_receivable_account = get_party_account(transaction.party_type, transaction.party, transaction.company)
        
        if not party_receivable_account:
            frappe.throw(_("Could not find receivable account for {0} {1} in company {2}").format(
                transaction.party_type, transaction.party, transaction.company))
        
        # --- Get a Bank/Cash account for the company (Paid From side) ---
        # Try to find a default bank account or cash account
        bank_account = frappe.db.get_value("Account", 
            {"company": transaction.company, "account_type": "Bank", "is_group": 0}, 
            "name")
        
        if not bank_account:
            # If no bank account, try cash account
            bank_account = frappe.db.get_value("Account", 
                {"company": transaction.company, "account_type": "Cash", "is_group": 0}, 
                "name")
        
        if not bank_account:
            # If still no account, create a dummy journal entry instead of payment entry
            # This is a fallback option
            return create_dummy_journal_entry_for_reconciliation(transaction, vouchers, total_allocation_amount, party_receivable_account)

        # --- Create Payment Entry ---
        pe = frappe.new_doc("Payment Entry")
        pe.payment_type = "Receive"
        pe.company = transaction.company
        pe.posting_date = transaction.statement_date
        pe.party_type = transaction.party_type
        pe.party = transaction.party
        pe.paid_amount = total_allocation_amount
        pe.received_amount = total_allocation_amount
        pe.reference_no = transaction.customer_reference or transaction.name
        pe.reference_date = transaction.statement_date
        pe.mode_of_payment = frappe.db.get_default("default_mode_of_payment") 
        
        # Set exchange rates
        pe.target_exchange_rate = 1.0
        pe.source_exchange_rate = 1.0
        pe.party_account = party_receivable_account

        # FIX: Use the SPECIFIC party receivable account for paid_to
        # For "Receive" payment type:
        # - paid_from: Where money comes from (Bank/Cash account)
        # - paid_to: Where money goes to (Party's specific Receivable account)
        pe.paid_from =  party_receivable_account # Bank/Cash account
        pe.paid_to =  bank_account # Party's specific Receivable account
        

        # Set currencies
        pe.paid_from_currency = transaction.currency 
        pe.paid_to_currency = frappe.get_cached_value('Company', pe.company, 'default_currency')
        pe.set("__islocal", 1)

        # 3. Add Allocation References
        for voucher in vouchers:
            if voucher.get('payment_doctype') == 'Sales Invoice':
                pe.append("references", {
                    "reference_doctype": "Sales Invoice",
                    "reference_name": voucher.get('payment_name'),
                    "allocated_amount": voucher.get('amount'),
                    # FIX: Explicitly specify the party's A/R account for the reference line
                    # This tells the system exactly which account is being cleared by this reference.
                    "party_account": party_receivable_account 
                })
            elif voucher.get('payment_doctype') == 'Payment Entry':
                pe.append("references", {
                    "reference_doctype": "Payment Entry",
                    "reference_name": voucher.get('payment_name'),
                    "allocated_amount": voucher.get('amount'),
                    "party_account": party_receivable_account 
                })
        
        try:
            pe.insert() 
            pe.submit()
        except Exception as e:
            frappe.log_error(title="Debtor Reconciliation Payment Error", message=frappe.get_traceback())
            frappe.throw(_("Failed to create Payment Entry for reconciliation: {0}").format(str(e)))

        # Update DSE allocation status
        transaction.unallocated_amount -= total_allocation_amount
        transaction.is_reconciled = 1 if transaction.unallocated_amount <= flt(0.01) else 0
        transaction.matched_document_name = pe.name
        transaction.matched_doctype = 'Payment Entry'
        transaction.save(ignore_permissions=True)
        
        frappe.db.commit()

        return transaction

    else:
        # --- Original Bank Logic ---
        transaction = frappe.get_doc("Bank Transaction", bank_transaction_name)
        
        # Add the vouchers with zero allocation. Save() will perform the allocations and clearance
        if 0.0 >= transaction.unallocated_amount:
            frappe.throw(_("Bank Transaction {0} is already fully reconciled").format(transaction.name))
        
        for voucher in vouchers:
            transaction.append(
                "payment_entries",
                {
                    "payment_document": voucher["payment_doctype"],
                    "payment_entry": voucher["payment_name"],
                    "allocated_amount": 0.0,  # Temporary
                    "reconciliation_type": "Voucher Created" if is_new_voucher else "Matched",
                },
            )
        transaction.validate_duplicate_references()
        transaction.allocate_payment_entries()
        transaction.update_allocated_amount()
        transaction.set_status()
        transaction.save()
        
        return transaction


def create_dummy_journal_entry_for_reconciliation(transaction, vouchers, total_allocation_amount, party_receivable_account):
    """
    Fallback function to create a Journal Entry when no proper bank/cash account is found.
    This creates a simple JE to record the reconciliation without a proper Payment Entry.
    """
    try:
        # Create a Journal Entry instead
        je = frappe.new_doc("Journal Entry")
        je.voucher_type = "Journal Entry"
        je.company = transaction.company
        je.posting_date = transaction.statement_date
        je.cheque_no = transaction.customer_reference or transaction.name
        je.user_remark = _("Debtor Statement Entry Reconciliation for {0}").format(transaction.name)
        
        # Debit: Party Receivable (reducing the receivable)
        je.append("accounts", {
            "account": party_receivable_account,
            "party_type": transaction.party_type,
            "party": transaction.party,
            "debit_in_account_currency": total_allocation_amount,
            "debit": total_allocation_amount,
            "credit_in_account_currency": 0,
            "credit": 0,
        })
        
        # Credit: A temporary clearing account (or use the default receivable)
        # We'll use the same account but credit it
        je.append("accounts", {
            "account": party_receivable_account,
            "party_type": transaction.party_type,
            "party": transaction.party,
            "debit_in_account_currency": 0,
            "debit": 0,
            "credit_in_account_currency": total_allocation_amount,
            "credit": total_allocation_amount,
        })
        
        je.insert()
        je.submit()
        
        # Update DSE allocation status
        transaction.unallocated_amount -= total_allocation_amount
        transaction.is_reconciled = 1 if transaction.unallocated_amount <= flt(0.01) else 0
        transaction.matched_document_name = je.name
        transaction.matched_doctype = 'Journal Entry'
        transaction.save(ignore_permissions=True)
        
        frappe.db.commit()
        
        return transaction
        
    except Exception as e:
        frappe.log_error(title="Debtor Reconciliation Journal Entry Error", message=frappe.get_traceback())
        frappe.throw(_("Failed to create Journal Entry for reconciliation: {0}").format(str(e)))

@frappe.whitelist()
def unreconcile_transaction(transaction_name: str, data_source: str = 'Bank'):
    """
        Unreconcile a transaction
    """
    # NOTE: This function needs to be split/modified similarly to reconcile_vouchers
    
    if data_source == 'Debtor':
        # --- Debtor Logic ---
        dse = frappe.get_doc("Debtor Statement Entry", transaction_name)
        
        # 1. Cancel the created Payment Entry 
        if dse.matched_doctype == 'Payment Entry' and dse.matched_document_name:
             frappe.get_doc(dse.matched_doctype, dse.matched_document_name).cancel()
             
        # 2. Reset DSE fields
        dse.unallocated_amount = dse.deposit # Assuming no partial unallocation is tracked here
        dse.is_reconciled = 0
        dse.matched_document_name = None
        dse.matched_doctype = None
        dse.save(ignore_permissions=True)

    else:
        # --- Original Bank Logic ---
        transaction = frappe.get_doc("Bank Transaction", transaction_name)

        vouchers_to_cancel = []

        for entry in transaction.payment_entries:
            if entry.reconciliation_type == "Voucher Created":
                vouchers_to_cancel.append({
                    "doctype": entry.payment_document,
                    "name": entry.payment_entry,
                })
                
        transaction.remove_payment_entries()

        for voucher in vouchers_to_cancel:
            frappe.get_doc(voucher["doctype"], voucher["name"]).cancel()


@frappe.whitelist(methods=["POST"])
def create_bulk_internal_transfer(bank_transaction_names: list, 
                                  bank_account: str):
    """
        Create an internal transfer for multiple bank transactions
    """
    for bank_transaction_name in bank_transaction_names:

        bank_transaction = frappe.db.get_value("Bank Transaction", bank_transaction_name, ["name", "withdrawal", "bank_account", "date", "reference_number", "description"], as_dict=True)

        transaction_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")

        is_withdrawal = bank_transaction.withdrawal > 0.0

        if is_withdrawal:
            paid_from = transaction_account
            paid_to = bank_account
        else:
            paid_from = bank_account
            paid_to = transaction_account
        
        reference_no = (bank_transaction.reference_number or bank_transaction.description or '')[:140]
        
        create_internal_transfer(bank_transaction_name=bank_transaction.name,
                                 posting_date=bank_transaction.date,
                                 reference_date=bank_transaction.date,
                                 reference_no=reference_no,
                                 paid_from=paid_from,
                                 paid_to=paid_to,)

@frappe.whitelist()
def create_internal_transfer(bank_transaction_name: str, 
                             posting_date: str | datetime.date, 
                             reference_date: str | datetime.date, 
                             reference_no: str, 
                             paid_from: str, 
                             paid_to: str,
                             custom_remarks: bool = False,
                             remarks: str = None,
                             mirror_transaction_name: str = None,
                             dimensions: dict = None):
    """
    Create an internal transfer payment entry
    """

    bank_transaction = frappe.get_doc("Bank Transaction", bank_transaction_name)

    bank_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")
    company = frappe.get_cached_value("Account", bank_account, "company")

    is_withdrawal = bank_transaction.withdrawal > 0.0

    pe = frappe.new_doc("Payment Entry")

    pe.company = company
    pe.payment_type = "Internal Transfer"
    pe.posting_date = posting_date
    pe.reference_date = reference_date
    pe.reference_no = reference_no
    pe.custom_remarks = custom_remarks
    pe.paid_amount = bank_transaction.unallocated_amount
    pe.received_amount = bank_transaction.unallocated_amount

    # TODO: Support multi-currency transactions
    pe.target_exchange_rate = 1.0

    if custom_remarks:
        pe.remarks = remarks
    
    if dimensions:
        pe.update(dimensions)

    if is_withdrawal:
         pe.paid_to = paid_to
         pe.paid_from = bank_account
    else:
         pe.paid_from = paid_from
         pe.paid_to = bank_account
    
    pe.insert()
    pe.submit()

    vouchers = json.dumps(
		[
			{
				"payment_doctype": "Payment Entry",
				"payment_name": pe.name,
				"amount": bank_transaction.unallocated_amount,
			}
		]
	)

    transaction_id = reconcile_vouchers(bank_transaction_name, vouchers, is_new_voucher=True)

    if mirror_transaction_name:
        # Reconcile the mirror transaction
        reconcile_vouchers(mirror_transaction_name, vouchers, is_new_voucher=False)

    return transaction_id

@frappe.whitelist(methods=['POST'])
def create_bulk_bank_entry_and_reconcile(bank_transactions: list, 
                                         account: str):
    """
     Create bank entries for all transactions and reconcile them
    """
    for bank_transaction in bank_transactions:
        transactions_details = frappe.db.get_value("Bank Transaction", bank_transaction, ["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount", "date", "reference_number", "description"], as_dict=True)

        is_credit_card = frappe.get_cached_value("Bank Account", transactions_details.bank_account, "is_credit_card")

        # Check Number will be limited to 140 characters
        cheque_no = (transactions_details.reference_number or transactions_details.description or '')[:140]

        create_bank_entry_and_reconcile(bank_transaction_name=bank_transaction,
                                        cheque_date=transactions_details.date,
                                        posting_date=transactions_details.date,
                                        cheque_no=cheque_no,
                                        user_remark=transactions_details.description,
                                        entries=[{
                                            "account": account,
                                            "amount": transactions_details.unallocated_amount,
                                        }],
                                        voucher_type=("Credit Card Entry" if is_credit_card else "Bank Entry"))

@frappe.whitelist(methods=['POST'])
def create_bank_entry_and_reconcile(bank_transaction_name: str, 
                                    cheque_date: str | datetime.date,
                                    posting_date: str | datetime.date,
                                    cheque_no: str,
                                    entries: list,
                                    user_remark: str = None,
                                    voucher_type: str = "Bank Entry",
                                    dimensions: dict = None):
    """
        Create a bank entry and reconcile it with the bank transaction
    """
    # Create a new journal entry based on the bank transaction
    bank_transaction = frappe.db.get_values(
        "Bank Transaction",
        bank_transaction_name,
        fieldname=["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount"],
        as_dict=True,
    )[0]

    bank_account = frappe.get_cached_value("Bank Account", bank_transaction.bank_account, "account")
    company = frappe.get_cached_value("Account", bank_account, "company")

    default_cost_center = get_default_cost_center(company)

    bank_entry = frappe.get_doc({
        "doctype": "Journal Entry",
        "voucher_type": voucher_type,
        "company": company,
        "cheque_date": cheque_date,
        "posting_date": posting_date,
        "cheque_no": cheque_no,
        "user_remark": user_remark,
    })

    # Compute accounts for JE 
    is_withdrawal = bank_transaction.withdrawal > 0.0

    if is_withdrawal:
        bank_entry.append("accounts", {
            "account": bank_account,
            "bank_account": bank_transaction.bank_account,
            "credit_in_account_currency": bank_transaction.unallocated_amount,
            "credit": bank_transaction.unallocated_amount,
            "debit_in_account_currency": 0,
            "debit": 0,
        })
    else:
        bank_entry.append("accounts", {
            "account": bank_account,
            "bank_account": bank_transaction.bank_account,
            "debit_in_account_currency": bank_transaction.unallocated_amount,
            "debit": bank_transaction.unallocated_amount,
            "credit_in_account_currency": 0,
            "debit": 0,
        })
    
    if not dimensions:
        dimensions = {}
    
    for entry in entries:
        # Check if this account is a Income or Expense Account
        # If it is, and no cost center is added, select the company default cost center
        cost_center = dimensions.get("cost_center")

        if not cost_center:
            report_type = frappe.get_cached_value("Account", entry["account"], "report_type")
            if report_type == "Profit and Loss":
                # Cost center is required
                cost_center = default_cost_center
        
        credit = entry["amount"] if not is_withdrawal else 0
        debit = entry["amount"] if is_withdrawal else 0
        bank_entry.append("accounts", {
            "account": entry["account"],
            # TODO: Multi currency support
            "debit_in_account_currency": debit,
            "credit_in_account_currency": credit,
            "debit": debit,
            "credit": credit,
            "cost_center": cost_center,
            "party_type": entry.get("party_type") if entry.get("party") else None,
            "party": entry.get("party"),
            "user_remark": entry.get("user_remark"),
            **dimensions,
        })

    bank_entry.insert()
    bank_entry.submit()

    if bank_transaction.deposit > 0.0:
        paid_amount = bank_transaction.deposit
    else:
        paid_amount = bank_transaction.withdrawal

    return reconcile_vouchers(bank_transaction_name, json.dumps([{
        "payment_doctype": "Journal Entry",
        "payment_name": bank_entry.name,
        "amount": paid_amount,
    }]), is_new_voucher=True)

@frappe.whitelist(methods=['POST'])
def create_bulk_payment_entry_and_reconcile(bank_transaction_names: list, 
                                            party_type: str, 
                                            party: str, 
                                            account: str,
                                            mode_of_payment: str | None = None,
                                            data_source: str = 'Bank'):
    """
        MODIFIED: Create a payment entry and reconcile it with the statement entry.
    """

    for name in bank_transaction_names:
        
        if data_source == 'Debtor':
            # --- Debtor Statement Entry (DSE) creation logic ---
            dse = frappe.get_doc("Debtor Statement Entry", name)
            
            # Use DSE fields for PE creation
            is_receive = dse.deposit > 0.0
            
            # We assume Debtor mode is always for receiving a payment from a Customer (AR)
            if not is_receive:
                frappe.throw(_("Debtor Statement Entry must be a credit (deposit) to create a standard Payment Entry."))
                
            paid_from = account # The receiving account (e.g., Bank/Cash)
            paid_to = get_party_account(party_type, party, dse.company) # Receivable/Payable account is 'paid to' in receive
            
            amount = dse.unallocated_amount
            reference_no = (dse.reference_number or dse.description or '')[:140]
            date = dse.statement_date
            company = dse.company

        else:
            # --- Original Bank Transaction (BT) creation logic ---
            bt = frappe.db.get_value("Bank Transaction", name, ["name", "deposit", "withdrawal", "bank_account", "currency", "unallocated_amount", "date", "reference_number", "description", "company"], as_dict=True)
            transaction_account = frappe.get_cached_value("Bank Account", bt.bank_account, "account")

            is_withdrawal = bt.withdrawal > 0.0
            is_receive = not is_withdrawal
            
            if is_withdrawal:
                paid_from = transaction_account
                paid_to = account # The contra account (e.g. Expense/Asset)
            else:
                paid_from = account
                paid_to = transaction_account
            
            amount = bt.unallocated_amount
            reference_no = (bt.reference_number or bt.description or '')[:140]
            date = bt.date
            company = bt.company

        payment_entry_doc = frappe.get_doc({
            "doctype": "Payment Entry",
            "payment_type": "Receive" if is_receive else "Pay",
            "company": company,
            "mode_of_payment": mode_of_payment,
            "party_type": party_type,
            "party": party,
            "paid_from": paid_from,
            "paid_to": paid_to,
            "paid_amount": amount,
            "base_paid_amount": amount,
            "received_amount": amount,
            "base_received_amount": amount,
            "target_exchange_rate": 1,
            "source_exchange_rate": 1,
            "reference_date": date,
            "posting_date": date,
            "reference_no": reference_no,
            # Link to the external statement entry is only in the original Mint logic through the BT link field
        })
        
        payment_entry_doc.insert()
        payment_entry_doc.submit()

        # Reconcile using the appropriate logic
        reconcile_vouchers(name, json.dumps([{
            "payment_doctype": "Payment Entry",
            "payment_name": payment_entry_doc.name,
            "amount": payment_entry_doc.paid_amount,
        }]), is_new_voucher=True, data_source=data_source)

    
@frappe.whitelist(methods=['POST'])
def create_payment_entry_and_reconcile(bank_transaction_name: str, 
                                       payment_entry_doc: dict,
                                       data_source: str = 'Bank'):
    """
        Create a payment entry and reconcile it with the bank transaction
    """
    payment_entry = frappe.get_doc({
        **payment_entry_doc,
        "doctype": "Payment Entry",
    })
    payment_entry.insert()
    payment_entry.submit()
    return reconcile_vouchers(bank_transaction_name, json.dumps([{
        "payment_doctype": "Payment Entry",
        "payment_name": payment_entry.name,
        "amount": payment_entry.paid_amount,
    }]), is_new_voucher=True, data_source=data_source)


@frappe.whitelist(methods=['GET'])
def get_account_defaults(account: str):
    """
        Get the default cost center and write off account for an account
    """
    company, report_type = frappe.db.get_value("Account", account, ["company", "report_type"])

    return get_default_cost_center(company) if report_type == "Profit and Loss" else  ""


@frappe.whitelist(methods=["GET"])
def get_party_details(company: str, party_type: str, party: str):

    if not frappe.db.exists(party_type, party):
        frappe.throw(_("{0} {1} does not exist").format(party_type, party))

    party_account = get_party_account(party_type, party, company)
    _party_name = "title" if party_type == "Shareholder" else party_type.lower() + "_name"
    party_name = frappe.db.get_value(party_type, party, _party_name)

    return {
        "party_account": party_account,
        "party_name": party_name,
    }

@frappe.whitelist(methods=["GET"])
def search_for_transfer_transaction(transaction_id: str):
    """
    When users try to create a transfer, we could help them by searching for the mirror transaction.

    So for a withdrawal of 1000, we could search for a deposit of 1000 on the same date.

    If the mirror transaction is found, we return the bank account and account details.
    """
    company, withdrawal, deposit, date, bank_account = frappe.db.get_value("Bank Transaction", transaction_id, ["company", "withdrawal", "deposit", "date", "bank_account"])

    
    days = frappe.db.get_single_value("Mint Settings", "transfer_match_days")

    if not days:
        days = 4

    min_date = frappe.utils.add_days(date, -days)
    max_date = frappe.utils.add_days(date, days)
    mirror_tx = frappe.db.get_list("Bank Transaction", filters={
        "company": company,
        "date": ["between", [min_date, max_date]],
        "withdrawal": deposit,
        "bank_account": ["!=", bank_account],
        "deposit": withdrawal,
        "docstatus": 1,
        "status": "Unreconciled",
    }, fields=["name", "bank_account", "reference_number", "date", "description", "withdrawal", "deposit", "currency"])

    if len(mirror_tx) == 1:
        return {
            "name": mirror_tx[0].name,
            "reference_number": mirror_tx[0].reference_number,
            "description": mirror_tx[0].description,
            "currency": mirror_tx[0].currency,
            "withdrawal": mirror_tx[0].withdrawal,
            "deposit": mirror_tx[0].deposit,
            "date": mirror_tx[0].date,
            "bank_account": mirror_tx[0].bank_account,
            "account": frappe.get_cached_value("Bank Account", mirror_tx[0].bank_account, "account"),
        }

    return None