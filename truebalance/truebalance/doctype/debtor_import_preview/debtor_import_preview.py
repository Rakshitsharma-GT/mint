# Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class DebtorImportPreview(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link | None
		currency: DF.Link | None
		customer_reference: DF.Data | None
		file_credit_amount: DF.Currency
		file_debit_amount: DF.Currency
		is_duplicate: DF.Check
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		row_index: DF.Int
		statement_date: DF.Date | None
		target_invoice: DF.Currency
		target_payment: DF.Currency
		unique_hash: DF.Data | None
	# end: auto-generated types
	pass
