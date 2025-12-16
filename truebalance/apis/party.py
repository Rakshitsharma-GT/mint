# mint/mint/apis/party.py
from __future__ import annotations
import frappe
from frappe import _

@frappe.whitelist()
def get_party_list(party_type: str, company: str):
    """
    MODIFIED: Fetches a list of Customers or Suppliers for the PartyPicker component.
    Restricts party types to 'Customer' and 'Supplier'.
    """
    
    # 1. Enforcement: Only allow Customer or Supplier
    if party_type not in ['Customer', 'Supplier']:
        # If an invalid type is passed (like Employee/Shareholder), fall back or return empty
        return []

    # Get the title field name for display purposes
    title_field_map = {
        'Customer': 'customer_name', 
        'Supplier': 'supplier_name'
    }
    title_field = title_field_map.get(party_type, "name")

    # 2. Query the respective Doctype
    parties = frappe.get_list(
        party_type,
        filters={
            "company": company,
            "disabled": 0,
            "docstatus": 0
        },
        fields=["name", f"{title_field} as title"],
        order_by=f"{title_field} asc",
        limit_page_length=200
    )

    # If the title field doesn't exist (e.g., custom setup), use 'name' as a fallback display value
    for p in parties:
        if not p.get('title'):
            p['title'] = p['name']
            
    return parties