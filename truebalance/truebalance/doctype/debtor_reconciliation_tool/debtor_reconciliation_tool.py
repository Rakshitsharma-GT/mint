# Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class DebtorReconciliationTool(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		closing_statement_balance: DF.Currency
		company: DF.Link | None
		customer: DF.Link | None
		opening_receivable_balance: DF.Currency
		party: DF.DynamicLink | None
		party_type: DF.Link | None
		show_only_unreconciled: DF.Check
		source_import: DF.Link | None
		statement_from_date: DF.Date | None
		statement_to_date: DF.Date | None
	# end: auto-generated types
	pass
