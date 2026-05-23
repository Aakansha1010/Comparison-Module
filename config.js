// Module Configuration
const MODULE_CONFIG = {
    quotation_header: {
        name: "Quotation Header",
        icon: "📝",
        description: "Compare quotation header records",
        keyField: "Quotation_ID",
        sapLabel: "SAP Quotations",
        sfdcLabel: "SFDC Quotations",
        color: "#3b82f6"
    },
    quotation_line: {
        name: "Quotation Line",
        icon: "📋",
        description: "Compare quotation line items",
        keyField: "Line_ID",
        sapLabel: "SAP Line Items",
        sfdcLabel: "SFDC Line Items",
        color: "#8b5cf6"
    },
    order_header: {
        name: "Order Header",
        icon: "📦",
        description: "Compare order header records",
        keyField: "Order_ID",
        sapLabel: "SAP Orders",
        sfdcLabel: "SFDC Orders",
        color: "#06b6d4"
    },
    order_line: {
        name: "Order Line",
        icon: "🛒",
        description: "Compare order line items",
        keyField: "Item_ID",
        sapLabel: "SAP Items",
        sfdcLabel: "SFDC Items",
        color: "#f59e0b"
    },
    invoice_header: {
        name: "Invoice Header",
        icon: "💰",
        description: "Compare invoice header records",
        keyField: "Invoice_ID",
        sapLabel: "SAP Invoices",
        sfdcLabel: "SFDC Invoices",
        color: "#10b981"
    },
    invoice_line: {
        name: "Invoice Line",
        icon: "📄",
        description: "Compare invoice line items",
        keyField: "Line_No",
        sapLabel: "SAP Invoice Lines",
        sfdcLabel: "SFDC Invoice Lines",
        color: "#ec4899"
    },
    dispatch_details: {
        name: "Dispatch Details",
        icon: "🚚",
        description: "Compare dispatch records",
        keyField: "Dispatch_ID",
        sapLabel: "SAP Dispatch",
        sfdcLabel: "SFDC Dispatch",
        color: "#ef4444"
    }
};

// Helper function to get module config
function getModuleConfig(moduleKey) {
    return MODULE_CONFIG[moduleKey] || null;
}

// Helper function to get all modules
function getAllModules() {
    return Object.keys(MODULE_CONFIG);
}
