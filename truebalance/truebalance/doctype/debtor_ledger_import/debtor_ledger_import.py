# Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class DebtorLedgerImport(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from auto_house.auto_house.doctype.debtor_import_log.debtor_import_log import DebtorImportLog
		from frappe.types import DF
		from truebalance.truebalance.doctype.debtor_import_preview.debtor_import_preview import DebtorImportPreview

		amended_from: DF.Link | None
		customer: DF.Link | None
		debtor_import_preview: DF.Table[DebtorImportPreview]
		file_to_upload: DF.Attach | None
		import_end_time: DF.Datetime | None
		import_log: DF.Table[DebtorImportLog]
		import_start_time: DF.Datetime | None
		import_status: DF.Literal["Queued", "Parsing", "Completed", "Failed"]
		parsed_rows: DF.Int
	# end: auto-generated types
	pass
