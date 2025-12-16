# mint/mint/apis/transactions.py
from __future__ import annotations
import frappe
from frappe import _
from frappe.utils import flt

@frappe.whitelist()
def get_bank_transactions(bank_account=None, from_date=None, to_date=None, all_transactions=False, data_source='Bank'):
    """
    MODIFIED: Fetches external transactions, selecting between Bank Transactions and Debtor Statement Entries.
    
    The 'bank_account' argument from the frontend is used as the Party/Customer name when data_source='Debtor'.
    """
    
    # --- 1. DETERMINE SOURCE DOCTYPE AND FIELD NAMES ---
    
    if data_source == 'Debtor':
        # --- Debtor Logic: Targets Debtor Statement Entry (DSE) ---
        external_doctype = 'Debtor Statement Entry'
        date_field = 'statement_date'
        party_name = bank_account 
        
        if not party_name:
            return []
            
        filters = {
            'party': party_name, # Filter by the selected Party ID
            date_field: ['between', [from_date, to_date]],
            'docstatus': 0 
        }

        # --- CRITICAL FIX: Use 'is_reconciled = 0' as a safe filter for unreconciled entries ---
        if not all_transactions:
            # We use 'is_reconciled = 0' (False) as the filter for unreconciled entries
            filters['is_reconciled'] = 0 
        
        
        # Fields are aliased to match the 'BankTransaction' type expected by the React UI
        # Assumes you have added all necessary fields (description, unallocated_amount, status, matched_rule)
        fields = [
            f"{date_field} as date", 
            "payment_amount_credit as deposit",
            "payment_amount_debit as withdrawal",
            "currency",
            "customer_reference as reference_number",
            "description", 
            "name",
            "company",
            "party",
            "party_type",
            "unallocated_amount", 
            "allocated_amount", 
            "status", 
            "transaction_type",
            "matched_rule"
        ]
        
    else:
        # --- Original Bank Logic: Targets Bank Transaction ---
        external_doctype = 'Bank Transaction'
        date_field = 'date'
        
        filters = {
            "bank_account": bank_account,
            "docstatus": 1,
            "unallocated_amount": (">", 0.0) if not all_transactions else ['!=', 2],
            date_field: ['between', [from_date, to_date]]
        }
        
        # Original fields
        fields = [
            "date", "deposit", "withdrawal", "currency", "description", 
            "transaction_type", "name", "bank_account", "company", "allocated_amount", 
            "unallocated_amount", "reference_number", "party_type", "party", "status", "matched_rule"
        ]

    # --- 2. EXECUTE QUERY ---
    
    if not bank_account: # Final safety check
        return []

    transactions = frappe.get_list(
        external_doctype,
        fields=fields,
        filters=filters,
        order_by=f"{date_field} asc"
    )
    
    return transactions