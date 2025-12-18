frappe.pages['bank-reconciliation'].on_page_load = function (wrapper) {
	// Redirect to the truebalance web app
	window.location.href = '/truebalance';

	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Bank Reconciliation - TrueBalance"),
		single_column: true,
	});

	page.set_primary_action("Open Bank Reconciliation", function () {
		window.location.href = '/truebalance';
	});
}
