# mint/mint/apis/reconciliation.py
from __future__ import annotations
import frappe
from frappe import _
from frappe.utils import flt, getdate
from erpnext.accounts.doctype.bank_reconciliation_tool.bank_reconciliation_tool import get_linked_payments as erpnext_get_linked_payments

@frappe.whitelist()
def get_vouchers_for_reco(bank_transaction_name, document_types, from_date, to_date, filter_by_reference_date, data_source='Bank'):
    """
    Handles fetching of internal matching vouchers.
    Switches logic based on data_source: Bank (calls ERPNext core) vs. Debtor (custom AR query).
    
    bank_transaction_name is the name of the external statement entry.
    """
    
    if data_source == 'Debtor':
        # --- Debtor Logic: Find Sales Invoices and Payments for the Customer ---
        
        # 1. Get the Debtor Statement Entry (DSE) to find the party name and amount
        try:
            dse = frappe.get_doc('Debtor Statement Entry', bank_transaction_name)
        except frappe.DoesNotExistError:
            # Should not happen if transactions.py worked, but handled defensively
            return []
        
        linked_vouchers = []
        
        if dse.party and dse.party_type == 'Customer':
            
            # --- 2. Query Outstanding Sales Invoices (The core AR balance entry) ---
            invoices = frappe.get_all(
                "Sales Invoice",
                filters={
                    "customer": dse.party,
                    "docstatus": 1,
                    # Target only open invoices
                    "outstanding_amount": (">", 0), 
                    "posting_date": ['between', [from_date, to_date]],
                },
                # Alias fields to match the LinkedPayment interface expected by the UI
                fields=["name", "posting_date", "outstanding_amount as paid_amount", "customer as party", 'currency', 'due_date'],
                order_by="posting_date asc"
            )

            # Map Invoices to the LinkedPayment structure 
            mapped_invoices = [{
                'doctype': 'Sales Invoice',
                'name': inv.name,
                'paid_amount': inv.paid_amount,
                'posting_date': str(inv.posting_date),
                'currency': inv.currency,
                'party': inv.party,
                'party_type': 'Customer',
                'rank': 10, # Mock rank for UI to display it
                'reference_no': inv.name,
                'reference_date': str(inv.posting_date)
            } for inv in invoices]
            
            linked_vouchers.extend(mapped_invoices)
            
            # --- 3. Query Unallocated Payment Entries (If a payment was booked on account) ---
            payments = frappe.get_all(
                "Payment Entry",
                filters={
                    "party": dse.party,
                    "party_type": "Customer",
                    "docstatus": 1,
                    # Target only unallocated payments
                    "unallocated_amount": (">", 0), 
                    "posting_date": ['between', [from_date, to_date]],
                },
                fields=["name", "posting_date", "unallocated_amount as paid_amount", "party", 'paid_from_account_currency as currency', 'reference_no', 'reference_date'],
                order_by="posting_date asc"
            )

            mapped_payments = [{
                'doctype': 'Payment Entry',
                'name': pay.name,
                'paid_amount': pay.paid_amount,
                'posting_date': str(pay.posting_date),
                'currency': pay.currency,
                'party': pay.party,
                'party_type': 'Customer',
                'rank': 5, # Lower rank than Invoices
                'reference_no': pay.reference_no or pay.name,
                'reference_date': str(pay.reference_date) if pay.reference_date else str(pay.posting_date)
            } for pay in payments]

            linked_vouchers.extend(mapped_payments)

            # NOTE: You would add fuzzy matching logic here later to sort the 'rank' field.
            
            return linked_vouchers
            
        return []
        
    else:
        # --- Original Bank Logic: Call the ERPNext core function ---
        return erpnext_get_linked_payments(bank_transaction_name, document_types, from_date, to_date, filter_by_reference_date)