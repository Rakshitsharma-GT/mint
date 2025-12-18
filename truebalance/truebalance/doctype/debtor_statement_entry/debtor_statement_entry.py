# Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class DebtorStatementEntry(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from auto_house.auto_house.doctype.debtor_statement_audit.debtor_statement_audit import DebtorStatementAudit
		from frappe.types import DF

		allocated_amount: DF.Currency
		audit_entries: DF.Table[DebtorStatementAudit]
		company: DF.Link | None
		currency: DF.Link | None
		customer_reference: DF.Data | None
		description: DF.Data | None
		is_reconciled: DF.Check
		matched_doctype: DF.Link | None
		matched_document_name: DF.DynamicLink | None
		party: DF.Data | None
		party_type: DF.Data | None
		payment_amount_credit: DF.Currency
		payment_amount_debit: DF.Currency
		reconciled_at: DF.Datetime | None
		reconciled_by: DF.Data | None
		reconciled_with: DF.Data | None
		reference_number: DF.Data | None
		source_import: DF.Link | None
		statement_date: DF.Date | None
		status: DF.Literal["Unreconciled", "Partially Reconciled", "Fully Reconciled"]
		transaction_type: DF.Literal["Deposit", "Withdrawal"]
		unallocated_amount: DF.Currency
		unique_hash: DF.Data | None
	# end: auto-generated types
	pass
