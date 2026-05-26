// Comparison page script

// Global state
let file1Data = null;
let file2Data = null;
let comparisonResult = null;
let currentModalData = [];
let currentModalType = null;
let selectedModule = null;
let moduleConfig = null;
let currentFieldDetail = null;
let fieldDetailView = 'all'; // 'all', 'matching', 'non-matching'

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
    initializeModule();
    setupFileUpload('file1', 'uploadBox1', 'fileName1');
    setupFileUpload('file2', 'uploadBox2', 'fileName2');
    
    document.getElementById('compareBtn').addEventListener('click', performComparison);
    document.getElementById('searchTable').addEventListener('input', searchTable);
});

// Initialize module
function initializeModule() {
    selectedModule = sessionStorage.getItem('selectedModule');
    
    if (!selectedModule || !MODULE_CONFIG[selectedModule]) {
        // Redirect to home if no module selected
        window.location.href = 'home.html';
        return;
    }
    
    moduleConfig = MODULE_CONFIG[selectedModule];
    
    // Update header
    document.getElementById('moduleTitle').innerHTML = `${moduleConfig.icon} ${moduleConfig.name}`;
    document.getElementById('moduleSubtitle').textContent = moduleConfig.description;
    
    // Update file labels
    document.getElementById('sapFileLabel').textContent = `Upload ${moduleConfig.sapLabel}`;
    document.getElementById('sfdcFileLabel').textContent = `Upload ${moduleConfig.sfdcLabel}`;
}

// Setup file upload for each box
function setupFileUpload(fileInputId, boxId, fileNameId) {
    const fileInput = document.getElementById(fileInputId);
    const uploadBox = document.getElementById(boxId);
    const fileNameDisplay = document.getElementById(fileNameId);

    // Click to upload
    fileInput.addEventListener('change', (e) => handleFileSelect(e, fileNameId));

    // Drag and drop
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('drag-over');
    });

    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('drag-over');
    });

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect({ target: fileInput }, fileNameId);
        }
    });
}

// Handle file selection
function handleFileSelect(event, fileNameId) {
    const file = event.target.files[0];
    
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
        showAlert('Please select a valid CSV file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const csv = e.target.result;
            const data = parseCSV(csv);
            // If this is the SAP file (file1) and the selected module is Order Header/Line,
            // apply SAP-to-business value mappings before storing the parsed data.
            if (fileNameId === 'fileName1') {
                applySapMappings(data, selectedModule);
                file1Data = data;
                document.getElementById('fileName1').textContent = `✅ ${file.name}`;
            } else {
                file2Data = data;
                document.getElementById('fileName2').textContent = `✅ ${file.name}`;
            }

            updateKeyColumnOptions();
            showAlert(`File "${file.name}" uploaded successfully`, 'success');
        } catch (error) {
            showAlert(`Error parsing CSV: ${error.message}`, 'error');
        }
    };

    reader.readAsText(file);
}

// Parse CSV to array of objects
function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 1) throw new Error('CSV file is empty');

    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const obj = {};
        const values = lines[i].split(',').map(v => v.trim());
        
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });

        data.push(obj);
    }

    return { headers, data };
}

// Apply SAP value mappings for Order Header and Order Line modules
function applySapMappings(parsed, moduleKey) {
    if (!parsed || !parsed.headers || !Array.isArray(parsed.data)) return parsed;
    moduleKey = moduleKey || selectedModule;
    if (!moduleKey) return parsed;
    // Only apply for order header / order line modules
    if (!['order_header', 'order_line'].includes(moduleKey)) return parsed;

    const statusRegex = /status/i;
    const salesOrgRegex = /sales[_\s-]*org|sales[_\s-]*organization|salesorg/i;
    const orderTypeRegex = /order[_\s-]*type|ordertype/i;

    const salesOrgMap = {
        '1511': 'ESP LV',
        '1512': 'ESP-Automation',
        '1513': 'ESP Agri',
        '1514': 'ESP Retail',
        '1515': 'ESP Services'
    };

    parsed.data.forEach(row => {
        parsed.headers.forEach(header => {
            const raw = row[header] !== undefined ? String(row[header]).trim() : '';
            if (statusRegex.test(header)) {
                if (raw === 'A') row[header] = 'Not Yet Processed';
                else if (raw === 'B') row[header] = 'Partially Processed';
                else if (raw === 'C') row[header] = 'Completely Processed';
            } else if (salesOrgRegex.test(header)) {
                if (salesOrgMap[raw]) row[header] = salesOrgMap[raw];
            } else if (orderTypeRegex.test(header)) {
                const up = raw.toUpperCase();
                if (up === 'ZORS') row[header] = 'Standard Order';
                else if (up === 'ZPRS') row[header] = 'Project Quotation';
            }
        });
    });

    return parsed;
}

// Normalize data formats across both SAP and SFDC files
function normalizeDataFormats(parsed) {
    if (!parsed || !parsed.headers || !Array.isArray(parsed.data)) return parsed;

    // Helper to detect if a value looks like a date
    function isDateLike(val) {
        if (!val) return false;
        const s = String(val).trim();
        // Match common date patterns: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, YYYY-MM-DD HH:MM:SS
        return /^(\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4}|\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4}\s\d{1,2}:\d{1,2}:\d{1,2})/.test(s);
    }

    // Helper to parse date and return ISO string (YYYY-MM-DD)
    function parseDate(val) {
        if (!val) return val;
        const s = String(val).trim();
        try {
            const d = new Date(s);
            if (!isNaN(d.getTime())) {
                return d.toISOString().split('T')[0];
            }
        } catch (e) {}
        return s;
    }

    // Helper to detect if a value looks like a number
    function isNumberLike(val) {
        if (!val) return false;
        const s = String(val).trim();
        // Match numbers including those with commas, decimal points, or spaces as thousands separator
        return /^-?[\d,.\s]+$/.test(s) && /\d/.test(s);
    }

    // Helper to normalize numbers to a consistent format (remove spaces, handle commas)
    function normalizeNumber(val) {
        if (!val) return val;
        const s = String(val).trim();
        // Remove spaces (thousands separator in some locales)
        let normalized = s.replace(/\s/g, '');
        // If it contains both comma and period, determine which is decimal separator
        if (normalized.includes(',') && normalized.includes('.')) {
            const lastCommaIdx = normalized.lastIndexOf(',');
            const lastDotIdx = normalized.lastIndexOf('.');
            if (lastCommaIdx > lastDotIdx) {
                // Comma is decimal: remove dots, replace comma with period
                normalized = normalized.replace(/\./g, '').replace(',', '.');
            } else {
                // Dot is decimal: remove commas
                normalized = normalized.replace(/,/g, '');
            }
        } else if (normalized.includes(',')) {
            // Only comma: could be decimal (EU) or thousands (US with only one group)
            // If there are <= 2 digits after comma, treat as decimal
            const parts = normalized.split(',');
            if (parts[1] && parts[1].length <= 2) {
                normalized = parts[0].replace(/\./g, '') + '.' + parts[1];
            } else {
                normalized = normalized.replace(/,/g, '');
            }
        }
        return normalized;
    }

    // Analyze column data types and normalize
    const columnTypes = {};
    
    parsed.headers.forEach(header => {
        let hasDateLike = false;
        let hasNumberLike = false;
        let sampleValues = [];

        for (let i = 0; i < Math.min(parsed.data.length, 10); i++) {
            const val = parsed.data[i][header];
            if (val && String(val).trim().length > 0) {
                sampleValues.push(val);
                if (isDateLike(val)) hasDateLike = true;
                if (isNumberLike(val)) hasNumberLike = true;
            }
        }

        // Determine primary type: date > number > text
        if (hasDateLike && sampleValues.length >= 2 && sampleValues.filter(isDateLike).length >= sampleValues.length * 0.5) {
            columnTypes[header] = 'date';
        } else if (hasNumberLike && sampleValues.length >= 2 && sampleValues.filter(isNumberLike).length >= sampleValues.length * 0.8) {
            columnTypes[header] = 'number';
        } else {
            columnTypes[header] = 'text';
        }
    });

    // Normalize values by detected type
    parsed.data.forEach(row => {
        parsed.headers.forEach(header => {
            const type = columnTypes[header];
            let val = row[header];
            
            if (val === undefined || val === null || val === '') {
                row[header] = '';
            } else {
                const s = String(val).trim();
                if (type === 'date') {
                    row[header] = parseDate(s);
                } else if (type === 'number') {
                    row[header] = normalizeNumber(s);
                } else {
                    // For text: trim and preserve case
                    row[header] = s;
                }
            }
        });
    });

    // Store column type info for reference
    parsed.columnTypes = columnTypes;
    return parsed;
}

// Update key column options
function updateKeyColumnOptions() {
    const select = document.getElementById('keyColumn');
    
    if (!file1Data || !file2Data) {
        select.disabled = true;
        return;
    }

    const commonColumns = file1Data.headers.filter(h => 
        file2Data.headers.includes(h)
    );

    if (commonColumns.length === 0) {
        showAlert('No common columns found between files', 'error');
        select.disabled = true;
        return;
    }

    // Pre-select the module's key field if it exists
    select.innerHTML = '<option value="">Select a column...</option>';
    commonColumns.forEach(col => {
        const option = document.createElement('option');
        option.value = col;
        option.textContent = col;
        
        // Pre-select if this is the module's key field
        if (col === moduleConfig.keyField) {
            option.selected = true;
        }
        
        select.appendChild(option);
    });

    // If module's key field exists in both files, enable compare
    if (commonColumns.includes(moduleConfig.keyField)) {
        select.value = moduleConfig.keyField;
    }
    
    select.disabled = false;
}

// Enable/disable compare button
document.addEventListener('change', () => {
    const keyColumn = document.getElementById('keyColumn').value;
    document.getElementById('compareBtn').disabled = !keyColumn;
});

// Perform comparison
function performComparison() {
    const keyColumn = document.getElementById('keyColumn').value;

    if (!file1Data || !file2Data || !keyColumn) {
        showAlert('Please upload both files and select a key column', 'error');
        return;
    }

    try {
        // Normalize data formats in both files before comparison
        normalizeDataFormats(file1Data);
        normalizeDataFormats(file2Data);

        // Get common columns
        const commonCols = file1Data.headers.filter(h => 
            file2Data.headers.includes(h)
        );

        // Create maps for quick lookup
        const map1 = new Map();
        const map2 = new Map();

        file1Data.data.forEach(row => {
            map1.set(row[keyColumn], row);
        });

        file2Data.data.forEach(row => {
            map2.set(row[keyColumn], row);
        });

        // Find records in each system
        const onlyInFile1 = [];
        const onlyInFile2 = [];
        const common = [];

        // Records in File1
        map1.forEach((row, key) => {
            if (!map2.has(key)) {
                onlyInFile1.push({ ...row, [keyColumn]: key });
            } else {
                common.push(key);
            }
        });

        // Records in File2
        map2.forEach((row, key) => {
            if (!map1.has(key)) {
                onlyInFile2.push({ ...row, [keyColumn]: key });
            }
        });

        // Find common records and compare
        const fieldComparison = {};
        const mismatches = [];
        const matches = [];

        commonCols.forEach(col => {
            if (col !== keyColumn) {
                fieldComparison[col] = {
                    field: col,
                    total: common.length,
                    matching: 0,
                    nonMatching: 0
                };
            }
        });

        common.forEach(key => {
            const row1 = map1.get(key);
            const row2 = map2.get(key);
            let recordMatches = true;
            const mismatchDetails = {};

            commonCols.forEach(col => {
                if (col !== keyColumn) {
                    const val1 = (row1[col] || '').toString().trim();
                    const val2 = (row2[col] || '').toString().trim();
                    
                    if (val1 === val2) {
                        fieldComparison[col].matching++;
                    } else {
                        recordMatches = false;
                        fieldComparison[col].nonMatching++;
                        mismatchDetails[col] = { file1: val1, file2: val2 };
                    }
                }
            });

            if (recordMatches) {
                matches.push(row1);
            } else {
                mismatches.push({
                    [keyColumn]: key,
                    ...row1,
                    _mismatches: mismatchDetails
                });
            }
        });

        comparisonResult = {
            keyColumn,
            totalFile1: map1.size,
            totalFile2: map2.size,
            commonRecords: common.length,
            onlyInFile1: onlyInFile1,
            onlyInFile2: onlyInFile2,
            mismatchRecords: mismatches,
            matchRecords: matches,
            fieldComparison,
            totalMatchingFields: Object.values(fieldComparison).reduce((sum, f) => sum + f.matching, 0),
            totalMismatches: Object.values(fieldComparison).reduce((sum, f) => sum + f.nonMatching, 0)
        };

        displayResults();
        showAlert('Comparison completed successfully!', 'success');
    } catch (error) {
        showAlert(`Comparison error: ${error.message}`, 'error');
    }
}

// Display results
function displayResults() {
    if (!comparisonResult) return;

    const { totalFile1, totalFile2, commonRecords, onlyInFile1, onlyInFile2, mismatchRecords, matchRecords, fieldComparison } = comparisonResult;

    // Update KPI cards
    document.getElementById('totalSapRecords').textContent = totalFile1.toLocaleString();
    document.getElementById('totalSfdcRecords').textContent = totalFile2.toLocaleString();
    document.getElementById('matchedKpiRecords').textContent = matchRecords.length.toLocaleString();
    
    // Calculate average of field-level Match % values
    const fieldMatchPercentages = Object.values(fieldComparison).map(field => {
        return field.total > 0 ? (field.matching / field.total) * 100 : 0;
    });
    
    const averageMatchPercentage = fieldMatchPercentages.length > 0
        ? (fieldMatchPercentages.reduce((a, b) => a + b, 0) / fieldMatchPercentages.length).toFixed(2)
        : 0;
    
    document.getElementById('matchPercentageKpi').textContent = `${averageMatchPercentage}%`;
    document.getElementById('progressFill').style.width = `${averageMatchPercentage}%`;

    const quantityMatchPercentage = totalFile1 > 0 && totalFile2 > 0
        ? ((commonRecords / Math.max(totalFile1, totalFile2)) * 100).toFixed(2)
        : 0;

    document.getElementById('quantityMatchPercentageKpi').textContent = `${quantityMatchPercentage}%`;
    document.getElementById('quantityProgressFill').style.width = `${quantityMatchPercentage}%`;

    const recordDifference = Math.abs(totalFile1 - totalFile2);
    const recordDiffEl = document.getElementById('recordDifferenceKpi');
    if (recordDiffEl) recordDiffEl.textContent = recordDifference.toLocaleString();

    // Determine date range from SAP file (file1Data) if possible
    const dateRangeEl = document.getElementById('comparisonDateRange');
    if (dateRangeEl && window.file1Data && Array.isArray(window.file1Data.data)) {
        const headers = window.file1Data.headers || [];
        const dateCol = headers.find(h => /date|deliv|delivery date/i.test(h));
        if (dateCol) {
            const dates = window.file1Data.data.map(r => new Date(r[dateCol])).filter(d => !isNaN(d));
            if (dates.length > 0) {
                const min = new Date(Math.min(...dates));
                const max = new Date(Math.max(...dates));
                const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                dateRangeEl.textContent = `${fmt(min)} → ${fmt(max)}`;
            } else {
                dateRangeEl.textContent = '';
            }
        } else {
            dateRangeEl.textContent = '';
        }
    }

    // Update missing/extra cards
    document.getElementById('missingSapRecords').textContent = onlyInFile2.length.toLocaleString();
    document.getElementById('missingSfdcRecords').textContent = onlyInFile1.length.toLocaleString();
    document.getElementById('extraSapRecords').textContent = onlyInFile1.length.toLocaleString();
    document.getElementById('extraSfdcRecords').textContent = onlyInFile2.length.toLocaleString();
    document.getElementById('mismatchedRecords').textContent = mismatchRecords.length.toLocaleString();
    document.getElementById('perfectMatches').textContent = matchRecords.length.toLocaleString();

    // Update table with clickable rows
    const tbody = document.querySelector('#comparisonTable tbody');
    tbody.innerHTML = '';

    Object.values(fieldComparison).forEach(field => {
        const matchPercent = field.total > 0 
            ? ((field.matching / field.total) * 100).toFixed(2)
            : 0;

        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.style.transition = 'background-color 0.3s ease';
        row.onmouseover = () => row.style.backgroundColor = '#f0f9ff';
        row.onmouseout = () => row.style.backgroundColor = '';
        row.onclick = () => openFieldDetailModal(field.field);
        
        row.innerHTML = `
            <td>${field.field}</td>
            <td>${field.total}</td>
            <td><span style="color: #10b981; font-weight: 600;">${field.matching}</span></td>
            <td><span style="color: #ef4444; font-weight: 600;">${field.nonMatching}</span></td>
            <td>${matchPercent}%</td>
        `;
        tbody.appendChild(row);
    });

    document.getElementById('resultsSection').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Modal Functions
function openModal(type) {
    currentModalType = type;
    const modal = document.getElementById('modal');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalTable = document.getElementById('modalTable');

    let data = [];
    let title = '';
    const keyColumn = comparisonResult.keyColumn;

    switch(type) {
        case 'missing_sap':
            title = '⚠️ Missing in SAP (in SFDC only)';
            data = comparisonResult.onlyInFile2;
            break;
        case 'missing_sfdc':
            title = '⚠️ Missing in SFDC (in SAP only)';
            data = comparisonResult.onlyInFile1;
            break;
        case 'extra_sap':
            title = '➕ Extra in SAP (not in SFDC)';
            data = comparisonResult.onlyInFile1;
            break;
        case 'extra_sfdc':
            title = '➕ Extra in SFDC (not in SAP)';
            data = comparisonResult.onlyInFile2;
            break;
        case 'mismatches':
            title = '❌ Mismatched Records';
            data = comparisonResult.mismatchRecords;
            break;
        case 'matches':
            title = '✅ Perfect Match Records';
            data = comparisonResult.matchRecords;
            break;
    }

    currentModalData = data;
    modalTitle.textContent = title;

    // Build table
    const headers = file1Data.headers;
    const headerRow = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>';
    modalTable.querySelector('thead').innerHTML = headerRow;

    const bodyRows = data.map(record => {
        return '<tr>' + headers.map(header => {
            let value = record[header] || '';
            
            // Highlight mismatches for mismatching records
            if (type === 'mismatches' && record._mismatches && record._mismatches[header]) {
                const { file1, file2 } = record._mismatches[header];
                value = `<strong style="color: #ef4444;">${file1}</strong> → <strong style="color: #005C8C;">${file2}</strong>`;
            }
            
            return `<td>${value}</td>`;
        }).join('') + '</tr>';
    }).join('');

    modalTable.querySelector('tbody').innerHTML = bodyRows;

    // Update stats
    document.getElementById('modalStats').textContent = `Showing ${data.length} record(s)`;

    // Show modal
    modalOverlay.style.display = 'block';
    modal.style.display = 'flex';
    document.getElementById('modalSearch').value = '';
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
    document.getElementById('modalOverlay').style.display = 'none';
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Open field detail modal
function openFieldDetailModal(fieldName) {
    const modal = document.getElementById('modal');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalTable = document.getElementById('modalTable');

    showLoading();

    requestAnimationFrame(() => {
        setTimeout(() => {
            try {
                // Build field detail data
                const fieldData = comparisonResult.fieldComparison[fieldName];
                const keyColumn = comparisonResult.keyColumn;
                const map1 = new Map();
                const map2 = new Map();

                // Create maps
                file1Data.data.forEach(row => {
                    map1.set(row[keyColumn], row);
                });
                file2Data.data.forEach(row => {
                    map2.set(row[keyColumn], row);
                });

                // Get matching and non-matching records for this field
                const matchingRecords = [];
                const nonMatchingRecords = [];

                comparisonResult.fieldComparison[fieldName] = comparisonResult.fieldComparison[fieldName] || {
                    field: fieldName,
                    matchingRecordKeys: [],
                    nonMatchingRecordKeys: []
                };

                // Iterate through common records
                const commonKeys = [];
                map1.forEach((row, key) => {
                    if (map2.has(key)) {
                        commonKeys.push(key);
                    }
                });

                commonKeys.forEach(key => {
                    const row1 = map1.get(key);
                    const row2 = map2.get(key);

                    const val1 = (row1[fieldName] || '').toString().trim();
                    const val2 = (row2[fieldName] || '').toString().trim();

                    if (val1 === val2) {
                        matchingRecords.push({
                            ...row1,
                            _source: 'SAP'
                        });
                    } else {
                        nonMatchingRecords.push({
                            [keyColumn]: key,
                            field: fieldName,
                            sapValue: val1,
                            sfdcValue: val2,
                            ...row1,
                            _source: 'SAP'
                        });
                    }
                });

                currentFieldDetail = {
                    fieldName,
                    matchingRecords,
                    nonMatchingRecords,
                    page: 1,
                    pageSize: 100
                };

                // Prepare modal dataset for export and paging
                currentModalData = [
                    ...matchingRecords.map(r => ({ ...r, _recordType: 'Matching' })),
                    ...nonMatchingRecords.map(r => ({ ...r, _recordType: 'Non-Matching' }))
                ];
                currentModalType = `field_${fieldName}`;

                fieldDetailView = 'all';
                modalTitle.textContent = `📊 Field-Level Details: ${fieldName}`;

                displayFieldDetailView();

                // Add view toggle buttons
                const modalControls = modal.querySelector('.modal-controls');
                if (modalControls) {
                    const existingToggle = modalControls.querySelector('.view-toggle-container');
                    if (existingToggle) {
                        existingToggle.remove();
                    }

                    const toggleContainer = document.createElement('div');
                    toggleContainer.className = 'view-toggle-container';
                    toggleContainer.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px; align-items: center;';
                    toggleContainer.innerHTML = `
                        <label style="font-weight: 600; margin-right: 10px;">View:</label>
                        <button class="btn-view view-all" onclick="switchFieldDetailView('all')" style="padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; background: #005C8C; color: white; font-weight: 600; transition: all 0.3s;">All Records</button>
                        <button class="btn-view view-matching" onclick="switchFieldDetailView('matching')" style="padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; background: #e5e7eb; color: #333; font-weight: 600; transition: all 0.3s;">✅ Matching Only</button>
                        <button class="btn-view view-non-matching" onclick="switchFieldDetailView('non-matching')" style="padding: 8px 16px; cursor: pointer; border: none; border-radius: 4px; background: #e5e7eb; color: #333; font-weight: 600; transition: all 0.3s;">❌ Non-Matching Only</button>
                    `;
                    modalControls.insertBefore(toggleContainer, modalControls.firstChild);
                }

                // Show modal
                modalOverlay.style.display = 'block';
                modal.style.display = 'flex';
                document.getElementById('modalSearch').value = '';
            } finally {
                hideLoading();
            }
        }, 50);
    });
}

// Switch field detail view
function switchFieldDetailView(view) {
    fieldDetailView = view;
    if (currentFieldDetail) {
        currentFieldDetail.page = 1;
    }
    displayFieldDetailView();
    
    // Update button styles
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.style.background = '#e5e7eb';
        btn.style.color = '#333';
    });
    
    if (view === 'all') {
        document.querySelector('.view-all').style.background = '#005C8C';
        document.querySelector('.view-all').style.color = 'white';
    } else if (view === 'matching') {
        document.querySelector('.view-matching').style.background = '#10b981';
        document.querySelector('.view-matching').style.color = 'white';
    } else if (view === 'non-matching') {
        document.querySelector('.view-non-matching').style.background = '#ef4444';
        document.querySelector('.view-non-matching').style.color = 'white';
    }
}

// Display field detail view
function displayFieldDetailView() {
    const modalTable = document.getElementById('modalTable');
    const modalStats = document.getElementById('modalStats');
    const modalPagination = document.getElementById('modalPagination');

    if (!currentFieldDetail) return;

    let displayData = [];

    if (fieldDetailView === 'all') {
        displayData = [
            ...currentFieldDetail.matchingRecords.map(r => ({ ...r, _recordType: 'Matching' })),
            ...currentFieldDetail.nonMatchingRecords.map(r => ({ ...r, _recordType: 'Non-Matching' }))
        ];
    } else if (fieldDetailView === 'matching') {
        displayData = currentFieldDetail.matchingRecords.map(r => ({ ...r, _recordType: 'Matching' }));
    } else if (fieldDetailView === 'non-matching') {
        displayData = currentFieldDetail.nonMatchingRecords.map(r => ({ ...r, _recordType: 'Non-Matching' }));
    }

    const displayPage = currentFieldDetail.page || 1;
    const pageSize = currentFieldDetail.pageSize || 100;
    const endIndex = displayPage * pageSize;
    const pagedData = displayData.slice(0, endIndex);

    // Build table
    const headers = file1Data.headers;
    const headerRow = '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '<th style="background: #f3f4f6; font-weight: 700;">Status</th></tr>';
    modalTable.querySelector('thead').innerHTML = headerRow;

    const bodyRows = pagedData.map(record => {
        let statusColor = '#10b981';
        let statusText = '✅ Match';

        if (record._recordType === 'Non-Matching') {
            statusColor = '#ef4444';
            statusText = '❌ Mismatch';
        }

        return '<tr>' + headers.map(header => {
            let value = record[header] || '';

            if (record._recordType === 'Non-Matching' && header === currentFieldDetail.fieldName) {
                const sapValue = record.sapValue || '';
                const sfdcValue = record.sfdcValue || '';
                value = `<strong style="color: #ef4444;">${sapValue}</strong> → <strong style="color: #005C8C;">${sfdcValue}</strong>`;
            }

            return `<td>${value}</td>`;
        }).join('') + `<td style="background: #f3f4f6; color: ${statusColor}; font-weight: 600; text-align: center;">${statusText}</td></tr>`;
    }).join('');

    modalTable.querySelector('tbody').innerHTML = bodyRows;

    const matchingCount = currentFieldDetail.matchingRecords.length;
    const nonMatchingCount = currentFieldDetail.nonMatchingRecords.length;
    const totalCount = displayData.length;
    const shownCount = pagedData.length;

    modalStats.innerHTML = `<strong>Field:</strong> ${currentFieldDetail.fieldName} | <strong>Total:</strong> ${matchingCount + nonMatchingCount} | <strong>Matching:</strong> <span style="color: #10b981;">${matchingCount}</span> | <strong>Non-Matching:</strong> <span style="color: #ef4444;">${nonMatchingCount}</span> | <strong>Showing:</strong> ${shownCount} of ${totalCount}`;

    if (modalPagination) {
        const remaining = totalCount - shownCount;
        if (remaining > 0) {
            modalPagination.innerHTML = `
                <button type="button" onclick="loadMoreFieldDetailPage()">Load Another 100 records</button>
                <p>${shownCount} of ${totalCount} records loaded</p>
            `;
        } else {
            modalPagination.innerHTML = `<p>All ${totalCount} records loaded</p>`;
        }
    }
}

function loadMoreFieldDetailPage() {
    if (!currentFieldDetail) return;
    currentFieldDetail.page = (currentFieldDetail.page || 1) + 1;
    displayFieldDetailView();
}

function filterModalTable() {
    const searchTerm = document.getElementById('modalSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#modalTable tbody tr');
    let visibleCount = 0;

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    document.getElementById('modalStats').textContent = `Showing ${visibleCount} record(s)`;
}

function exportModalData() {
    if (currentModalData.length === 0) {
        showAlert('No data to export', 'error');
        return;
    }

    const headers = file1Data.headers;
    let csv = headers.join(',') + '\n';

    const visibleRows = document.querySelectorAll('#modalTable tbody tr:not([style*="display: none"])');
    if (visibleRows.length > 0) {
        visibleRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            const values = Array.from(cells).map(cell => {
                let text = cell.textContent;
                // Remove HTML tags for CSV
                text = text.replace(/<[^>]*>/g, '');
                // Escape quotes and wrap in quotes if contains comma
                return text.includes(',') ? `"${text}"` : text;
            });
            csv += values.join(',') + '\n';
        });
    } else if (currentModalData && currentModalData.length > 0) {
        // Fallback to exporting the modal dataset
        currentModalData.forEach(record => {
            const values = headers.map(h => {
                let text = record[h] !== undefined ? String(record[h]) : '';
                text = text.replace(/<[^>]*>/g, '');
                return text.includes(',') ? `"${text}"` : text;
            });
            csv += values.join(',') + '\n';
        });
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    downloadFile(blob, `${selectedModule}_${currentModalType}_export.csv`);
    showAlert('Modal data exported successfully!', 'success');
}

// Search table
function searchTable() {
    const searchTerm = document.getElementById('searchTable').value.toLowerCase();
    const rows = document.querySelectorAll('#comparisonTable tbody tr');

    rows.forEach(row => {
        const fieldName = row.cells[0].textContent.toLowerCase();
        row.style.display = fieldName.includes(searchTerm) ? '' : 'none';
    });
}

// Export functions
function exportToExcel() {
    if (!comparisonResult) return;

    let html = '<table border="1"><tr><th>Field Name</th><th>Total</th><th>Matching</th><th>Non-Matching</th><th>Match %</th></tr>';
    
    Object.values(comparisonResult.fieldComparison).forEach(field => {
        const matchPercent = field.total > 0 
            ? ((field.matching / field.total) * 100).toFixed(2)
            : 0;
        html += `<tr><td>${field.field}</td><td>${field.total}</td><td>${field.matching}</td><td>${field.nonMatching}</td><td>${matchPercent}%</td></tr>`;
    });
    
    html += '</table>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    downloadFile(blob, `${selectedModule}_comparison_report.xls`);
    showAlert('Exported to Excel successfully!', 'success');
}

function exportToCSV() {
    if (!comparisonResult) return;

    let csv = 'Field Name,Total Records,Matching,Non-Matching,Match %\n';
    
    Object.values(comparisonResult.fieldComparison).forEach(field => {
        const matchPercent = field.total > 0 
            ? ((field.matching / field.total) * 100).toFixed(2)
            : 0;
        csv += `${field.field},${field.total},${field.matching},${field.nonMatching},${matchPercent}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    downloadFile(blob, `${selectedModule}_comparison_report.csv`);
    showAlert('Exported to CSV successfully!', 'success');
}

function exportToJSON() {
    if (!comparisonResult) return;

    const data = {
        module: selectedModule,
        moduleConfig: moduleConfig,
        summary: {
            totalSAPRecords: comparisonResult.totalFile1,
            totalSFDCRecords: comparisonResult.totalFile2,
            commonRecords: comparisonResult.commonRecords,
            matchingRecords: comparisonResult.matchRecords.length,
            mismatchingRecords: comparisonResult.mismatchRecords.length,
            missingInSAP: comparisonResult.onlyInFile2.length,
            missingInSFDC: comparisonResult.onlyInFile1.length,
            keyColumn: comparisonResult.keyColumn
        },
        fieldComparison: comparisonResult.fieldComparison
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadFile(blob, `${selectedModule}_comparison_report.json`);
    showAlert('Exported to JSON successfully!', 'success');
}

function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Navigation
function goHome() {
    sessionStorage.removeItem('selectedModule');
    window.location.href = 'home.html';
}

// Reset form
function resetForm() {
    file1Data = null;
    file2Data = null;
    comparisonResult = null;
    document.getElementById('file1').value = '';
    document.getElementById('file2').value = '';
    document.getElementById('fileName1').textContent = '';
    document.getElementById('fileName2').textContent = '';
    document.getElementById('keyColumn').value = '';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('alertContainer').innerHTML = '';
}

// Show alerts
function showAlert(message, type = 'info') {
    const container = document.getElementById('alertContainer');
    const alertId = 'alert-' + Date.now();
    
    const alert = document.createElement('div');
    alert.id = alertId;
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <div class="alert-content">
            <strong>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</strong> ${message}
        </div>
        <button class="alert-close" onclick="document.getElementById('${alertId}').remove()">×</button>
    `;
    
    container.appendChild(alert);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        const el = document.getElementById(alertId);
        if (el) el.remove();
    }, 5000);
}
    