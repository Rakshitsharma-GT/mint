from __future__ import annotations
import frappe
from frappe.model.document import Document
import hashlib

class DebtorStatementEntry(Document):
    def autoname(self):
        # do not change name if already set
        if self.name and not self.name.startswith("NEW-"):
            return

        h = self.unique_hash or compute_hash(
            self.company,
            self.customer_reference,
            self.statement_date,
            self.payment_amount_credit,
            self.payment_amount_debit
        )
        self.unique_hash = h
        self.name = h


def compute_hash(company, reference, date, credit, debit):
    base = "|".join([
        company or "",
        reference or "",
        date.isoformat() if hasattr(date, "isoformat") else (str(date) if date else ""),
        str(credit or ""),
        str(debit or "")
    ])
    return hashlib.md5(base.encode("utf-8")).hexdigest()
