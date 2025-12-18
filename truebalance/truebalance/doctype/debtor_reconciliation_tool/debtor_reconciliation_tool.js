// Copyright (c) 2025, The Commit Company (Algocode Technologies Pvt. Ltd.) and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Debtor Reconciliation Tool", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("Debtor Reconciliation Tool", {
    setup: function (frm) {
        // Set up filter for party field based on party type
        frm.set_query("party", function () {
            if (frm.doc.party_type) {
                return { 
                    filters: { 
                        disabled: 0,
                        docstatus: 0  // For doctypes that don't have disabled field
                    } 
                };
            }
        });
        
        // Disable saving the interface form itself
        frm.disable_save(); 
    },

    onload: function (frm) {
        // Set default dates and company on load
        let today = frappe.datetime.get_today();
        if (!frm.doc.statement_from_date) {
            frm.set_value("statement_from_date", frappe.datetime.add_months(today, -1));
        }
        if (!frm.doc.statement_to_date) {
            frm.set_value("statement_to_date", today);
        }
        if (!frm.doc.company) {
            frm.set_value("company", frappe.defaults.get_default("company"));
        }
        // Set default party type to Customer
        if (!frm.doc.party_type) {
            frm.set_value("party_type", "Customer");
        }
    },

    refresh: function (frm) {
        // Bind the button click event
        frm.events.bind_refresh_button(frm);
    },
    
    party_type: function(frm) {
        // Clear party when party type changes
        if (frm.doc.party) {
            frm.set_value("party", "");
        }
        
        // Update label based on party type
        if (frm.doc.party_type) {
            let label = frm.doc.party_type === "Customer" ? __("Customer") : 
                       frm.doc.party_type === "Supplier" ? __("Supplier") : 
                       frm.doc.party_type;
            
            frm.set_df_property("party", "label", label);
        }
    },

    bind_refresh_button: function(frm) {
        // Bind to the Button field defined in your DocType
        frm.fields_dict.refresh_results.$input.off('click').on('click', function() {
            if (!frm.doc.party || !frm.doc.party_type || !frm.doc.statement_to_date) {
                frappe.msgprint(__("Please select a Party Type, Party and To Date."));
                return;
            }
            
            frm.trigger("get_account_balances");
            frm.trigger("fetch_and_render_data");
        });
    },
    
    // --- BALANCE CALCULATIONS ---
    get_account_balances: function(frm) {
        if (!frm.doc.party || !frm.doc.party_type || !frm.doc.company) return;

        // 1. Get Opening Receivable Balance
        frappe.call({
            method: "auto_house.auto_house.doctype.debtor_reconciliation_tool.debtor_reconciliation_tool.get_opening_receivable_balance",
            args: {
                party: frm.doc.party,
                party_type: frm.doc.party_type,
                company: frm.doc.company,
                till_date: frm.doc.statement_from_date,
            },
            callback: (r) => {
                if (r.message !== undefined) {
                    frm.set_value("opening_receivable_balance", r.message);
                }
            },
        });

        // 2. Get Closing Statement Balance
        if (frm.doc.statement_to_date) {
            frappe.call({
                method: "auto_house.auto_house.doctype.debtor_reconciliation_tool.debtor_reconciliation_tool.get_closing_statement_balance",
                args: {
                    party: frm.doc.party,
                    party_type: frm.doc.party_type,
                    till_date: frm.doc.statement_to_date,
                },
                callback: (r) => {
                    if (r.message !== undefined) {
                        frm.set_value("closing_statement_balance", r.message);
                    }
                },
            });
        }
    },

    // --- DATA FETCHING & RENDERING ---
    fetch_and_render_data: function(frm) {
        const party = frm.doc.party;
        const party_type = frm.doc.party_type;
        const from_date = frm.doc.statement_from_date;
        const to_date = frm.doc.statement_to_date;
        const show_unrec = frm.doc.show_only_unreconciled ? 1 : 0;
        const company = frm.doc.company;

        // Get the HTML wrapper
        let $wrapper = frm.fields_dict.html_results.$wrapper;
        $wrapper.html('<div class="text-muted text-center py-5"><i class="fa fa-spinner fa-spin"></i> Loading reconciliation data...</div>');

        frappe.call({
            method: "auto_house.auto_house.doctype.debtor_reconciliation_tool.debtor_reconciliation_tool.fetch_reconciliation_data",
            args: {
                party: party,
                party_type: party_type,
                from_date: from_date,
                to_date: to_date,
                show_only_unreconciled: show_unrec,
                company: company
            },
            callback: function (r) {
                if (!r.message || !Array.isArray(r.message)) {
                    $wrapper.html(`<div class="text-muted text-center py-5">${__("No data returned")}</div>`);
                    return;
                }

                if (r.message.length === 0) {
                    $wrapper.html(`<div class="text-muted text-center py-5">${__("No entries found for the selected criteria")}</div>`);
                    return;
                }

                // Render the data table
               // Push statements to bottom
let sorted_entries = r.message.sort((a, b) => {
    const a_is_statement = a.source === "statement" || a.entry_type === "statement";
    const b_is_statement = b.source === "statement" || b.entry_type === "statement";
    return a_is_statement - b_is_statement; 
});

// Render
frm.events.render_html_table(frm, sorted_entries, $wrapper);

                
                frappe.show_alert({
                    message: __("Loaded {0} entries", [r.message.length]),
                    indicator: "green"
                });
            },
            error: function(r) {
                $wrapper.html(`<div class="text-danger text-center py-5">${__("Error loading data. Please try again.")}</div>`);
            }
        });
    },

render_html_table: function(frm, entries, $wrapper) {
    let html = `
        <div class="reconciliation-results">
            <table class="table table-bordered table-hover" id="reconciliation-table">
                <thead style="background:#f5f7fa;">
                    <tr>
                        <th>${__("Date")}</th>
                        <th>${__("Reference")}</th>
                        <th>${__("Voucher")}</th>
                        <th class="text-right">${__("Debit")}</th>
                        <th class="text-right">${__("Credit")}</th>
                        <th class="text-right">${__("Running Balance")}</th>
                        <th>${__("Against Voucher")}</th>
                        <th>${__("Supplier Invoice No")}</th>
                        <th>${__("Source")}</th>
                    </tr>
                    
                    <!-- FILTER ROW -->
                    <tr class="filter-row">
                        <th><input class="form-control filter-input" data-col="0" placeholder="${__("Filter Date")}"></th>
                        <th><input class="form-control filter-input" data-col="1" placeholder="${__("Filter Reference")}"></th>
                        <th><input class="form-control filter-input" data-col="2" placeholder="${__("Filter Voucher")}"></th>
                        <th><input class="form-control filter-input" data-col="3" placeholder="${__("Filter Debit")}"></th>
                        <th><input class="form-control filter-input" data-col="4" placeholder="${__("Filter Credit")}"></th>
                        <th><input class="form-control filter-input" data-col="5" placeholder="${__("Filter Balance")}"></th>
                        <th><input class="form-control filter-input" data-col="6" placeholder="${__("Filter Against")}"></th>
                        <th><input class="form-control filter-input" data-col="7" placeholder="${__("Filter Supplier Inv")}"></th>
                        <th><input class="form-control filter-input" data-col="8" placeholder="${__("Filter Source")}"></th>
                    </tr>
                </thead>
                <tbody>
    `;

    entries.forEach(e => {
        const date = e.date ? frappe.datetime.str_to_user(e.date) : "-";
        const debit = e.debit ? frappe.format(e.debit, {fieldtype:"Currency"}) : "-";
        const credit = e.credit ? frappe.format(e.credit, {fieldtype:"Currency"}) : "-";
        const run = frappe.format(e.running_balance, {fieldtype:"Currency"});

        // Make voucher clickable
        let voucher = "-";
        if (e.voucher_type && e.voucher_no) {
            const doc_type_slug = e.voucher_type.replace(/\s+/g,'-').toLowerCase();
            voucher = `<a href="/app/${doc_type_slug}/${e.voucher_no}" target="_blank" title="Open ${e.voucher_type}">
                        ${e.voucher_type} / ${e.voucher_no}
                       </a>`;
        }

        // Make against voucher clickable - enhanced logic
        let against_voucher_html = '-';
        if (e.against_voucher) {
            // First check if we have against_voucher_type
            if (e.against_voucher_type) {
                const against_doc_type_slug = e.against_voucher_type.replace(/\s+/g,'-').toLowerCase();
                against_voucher_html = `<a href="/app/${against_doc_type_slug}/${e.against_voucher}" target="_blank" title="Open ${e.against_voucher_type}">
                                        ${e.against_voucher}
                                       </a>`;
            } 
            // If no against_voucher_type, check against field for document type
            else if (e.against) {
                // Try to parse the against field which might contain doctype info
                // Format: "Purchase Invoice/PINV-0001" or "Sales Invoice/SINV-0001"
                const against_parts = e.against.split('/');
                if (against_parts.length === 2) {
                    const doc_type = against_parts[0];
                    const doc_name = against_parts[1];
                    const doc_type_slug = doc_type.replace(/\s+/g,'-').toLowerCase();
                    against_voucher_html = `<a href="/app/${doc_type_slug}/${doc_name}" target="_blank" title="Open ${doc_type}">
                                            ${e.against_voucher}
                                           </a>`;
                } else {
                    // If we can't parse, just show the voucher number
                    against_voucher_html = e.against_voucher;
                }
            }
            else {
                // Just show the voucher number without link
                against_voucher_html = e.against_voucher;
            }
        }

        html += `
            <tr>
                <td>${date}</td>
                <td>${e.ref || '-'}</td>
                <td>${voucher}</td>
                <td class="text-right">${debit}</td>
                <td class="text-right">${credit}</td>
                <td class="text-right">${run}</td>
                <td>${against_voucher_html}</td>
                <td>${e.supplier_invoice_no || '-'}</td>
                <td>${(e.source || '').toUpperCase()}</td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;

    $wrapper.html(html);

    // Column search functionality
    $wrapper.find(".filter-input").on("keyup", function () {
        const col = $(this).data("col");
        const val = $(this).val().toLowerCase();

        $wrapper.find("tbody tr").each(function () {
            const $row = $(this);
            const cell = $row.find("td").eq(col).text().toLowerCase();
            $row.toggle(cell.indexOf(val) !== -1);
        });
    });
    
    // Make columns resizable like Frappe reports
    frm.events.make_columns_resizable($wrapper);
},

make_columns_resizable: function($wrapper) {
    // Add CSS for resizable columns
    const style = document.createElement('style');
    style.textContent = `
        #reconciliation-table th {
            position: relative;
            overflow: hidden;
        }
        #reconciliation-table th .resize-handle {
            position: absolute;
            top: 0;
            right: 0;
            width: 5px;
            height: 100%;
            cursor: col-resize;
            background: transparent;
            z-index: 1;
        }
        #reconciliation-table th .resize-handle:hover,
        #reconciliation-table th .resize-handle.resizing {
            background: #007bff;
        }
        #reconciliation-table.filter-row th {
            padding: 4px 8px;
        }
        #reconciliation-table.filter-row .form-control {
            height: 28px;
            padding: 4px 8px;
            font-size: 12px;
        }
    `;
    document.head.appendChild(style);
    
    // Add resize handles to all headers except the last one
    const $table = $wrapper.find('#reconciliation-table');
    const $headers = $table.find('thead tr:first-child th');
    
    $headers.each(function(index) {
        if (index < $headers.length - 1) { // Don't add to last column
            $(this).append('<div class="resize-handle"></div>');
        }
    });
    
    // Make columns resizable
    let isResizing = false;
    let startX, startWidth, columnIndex;
    
    $wrapper.on('mousedown', '.resize-handle', function(e) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        
        const $header = $(this).parent();
        columnIndex = $header.index();
        startWidth = $header.width();
        
        $header.addClass('resizing');
        $(this).addClass('resizing');
        
        // Store original column widths
        $headers.each(function(i) {
            $(this).data('original-width', $(this).width());
        });
    });
    
    $(document).on('mousemove', function(e) {
        if (!isResizing) return;
        
        const diffX = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + diffX); // Minimum width 50px
        
        // Resize the column
        $headers.eq(columnIndex).width(newWidth);
        
        // Resize all cells in the column
        $table.find('tr').each(function() {
            $(this).find('td, th').eq(columnIndex).width(newWidth);
        });
    });
    
    $(document).on('mouseup', function() {
        if (isResizing) {
            isResizing = false;
            $headers.removeClass('resizing');
            $wrapper.find('.resize-handle').removeClass('resizing');
            
            // Store the new width for persistence (optional)
            const columnWidths = [];
            $headers.each(function(i) {
                columnWidths.push($(this).width());
            });
            // You could save these widths to localStorage if you want persistence
            // localStorage.setItem('reconciliation_col_widths', JSON.stringify(columnWidths));
        }
    });
}

/* COMMENTED OUT - Match functionality removed as requested

    handle_suggest_match: function(frm, statement_name, amount) {
        // Show a dialog to match with an invoice (only for Customers)
        frappe.prompt([
            {
                fieldname: 'invoice',
                label: __('Select Invoice to Match'),
                fieldtype: 'Link',
                options: 'Sales Invoice',
                reqd: 1,
                get_query: function() {
                    return {
                        filters: {
                            'customer': frm.doc.party,
                            'docstatus': 1,
                            'outstanding_amount': ['>', 0]
                        }
                    };
                }
            }
        ], 
        function(values) {
            // Perform the reconciliation
            frappe.call({
                method: "auto_house.auto_house.doctype.debtor_reconciliation_tool.debtor_reconciliation_tool.perform_debtor_reconciliation",
                args: {
                    statement_entry_name: statement_name,
                    matched_invoice_name: values.invoice
                },
                freeze: true,
                freeze_message: __("Processing reconciliation..."),
                callback: function(r) {
                    if (!r.exc) {
                        frappe.show_alert({
                            message: __("Successfully reconciled"),
                            indicator: "green"
                        });
                        // Refresh the data
                        frm.trigger("fetch_and_render_data");
                        frm.trigger("get_account_balances");
                    }
                }
            });
        },
        __("Match Statement Entry with Invoice"),
        __("Reconcile")
        );
    }
    
*/
});