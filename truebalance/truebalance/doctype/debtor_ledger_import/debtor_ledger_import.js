// Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Debtor Ledger Import", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on('Debtor Ledger Import', {

    refresh: function(frm) {
        console.log(1);
        
        if (!frm.doc.__islocal) {

            // Parse & Preview button
            frm.add_custom_button(__('Parse & Preview'), function() {
                frappe.show_alert({message: __('Parsing file...'), indicator: 'blue'});
                frappe.call({
                    method: 'auto_house.auto_house.doctype.debtor_ledger_import.debtor_ledger_import.parse_file_and_preview',
                    args: { docname: frm.doc.name },
                    callback: function(r) {
                        if (r.message) {
                            frappe.show_alert({message: __('Parsed {0} rows, {1} logs', [r.message.parsed_rows, r.message.log_count]), indicator: 'green'});
                            frm.reload_doc();
                        }
                    },
                    error: function(err) {
                        frappe.msgprint(__('Parse failed: ' + (err._server_messages || err.message)));
                    }
                });
            }, __('Actions'));

            // Start Import button
            frm.add_custom_button(__('Start Import'), function() {
                frappe.confirm(
                    __('Do you want to start import?'),
                    function() {
                        frappe.show_alert({message: __('Importing...'), indicator: 'blue'});
                        frappe.call({
                            method: 'auto_house.auto_house.doctype.debtor_ledger_import.debtor_ledger_import.start_import',
                            args: { docname: frm.doc.name },
                            callback: function(r) {
                                if (r.message) {
                                    frappe.show_alert({message: __('Created {0} rows, skipped {1}', [r.message.created, r.message.skipped]), indicator: 'green'});
                                    frm.reload_doc();
                                }
                            },
                            error: function(err) {
                                frappe.msgprint(__('Import failed: ' + (err._server_messages || err.message)));
                            }
                        });
                    }
                );
            }, __('Actions'));

        }
    }

});
