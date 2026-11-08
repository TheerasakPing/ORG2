use calamine::Range;

use super::*;

#[test]
fn range_to_rows_preserves_absolute_offsets() {
    let mut range = Range::new((2, 1), (2, 1));
    range.set_value((2, 1), Data::String("value".to_string()));

    let rows = range_to_rows(&range);

    assert_eq!(rows.len(), 3);
    assert!(rows[0].is_empty());
    assert!(rows[1].is_empty());
    assert_eq!(rows[2], vec!["".to_string(), "value".to_string()]);
}

#[test]
fn used_dimensions_from_range_uses_absolute_coordinates() {
    let mut range = Range::new((2, 1), (4, 3));
    range.set_value((3, 2), Data::String("value".to_string()));

    assert_eq!(used_dimensions_from_range(&range), (4, 3));
}

#[test]
fn read_rows_from_range_returns_requested_absolute_page() {
    let mut range = Range::new((2, 1), (4, 3));
    range.set_value((3, 2), Data::String("value".to_string()));

    let rows = read_rows_from_range(&range, 3, 1, 4, 3);

    assert_eq!(
        rows,
        vec![vec!["".to_string(), "".to_string(), "value".to_string()]]
    );
}

#[test]
fn group_patches_by_sheet_overwrites_duplicate_cell_with_last_value() {
    let patches = vec![
        XlsxCellPatch {
            sheet_name: "Sheet1".to_string(),
            row_index: 1,
            column_index: 2,
            value: "old".to_string(),
        },
        XlsxCellPatch {
            sheet_name: "Sheet1".to_string(),
            row_index: 1,
            column_index: 2,
            value: "new".to_string(),
        },
    ];

    let grouped = group_patches_by_sheet(&patches);

    assert_eq!(
        grouped
            .get("Sheet1")
            .and_then(|sheet| sheet.get(&1))
            .and_then(|row| row.get(&2)),
        Some(&"new".to_string())
    );
}

#[test]
fn apply_sheet_patches_expands_sparse_rows_and_columns() {
    let mut rows = vec![vec!["a".to_string()]];
    let mut row_patches = BTreeMap::new();
    row_patches.insert(2, "c".to_string());
    let mut sheet_patches = BTreeMap::new();
    sheet_patches.insert(2, row_patches);

    apply_sheet_patches(&mut rows, Some(&sheet_patches));

    assert_eq!(rows.len(), 3);
    assert_eq!(
        rows[2],
        vec!["".to_string(), "".to_string(), "c".to_string()]
    );
}


/// Full reader/writer regression for calamine upgrades: real XLSX bytes must
/// survive an ORG2 read -> save-patches -> reopen cycle.
#[test]
fn workbook_round_trip_reopens_and_persists_cell_patch() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("spreadsheet-roundtrip.xlsx");
    let mut workbook = Workbook::new();
    workbook
        .add_worksheet()
        .write_string(0, 0, "original")
        .unwrap();
    workbook.save(&path).unwrap();
    let path_str = path.to_string_lossy().into_owned();

    let info = workbook_info(&path_str).unwrap();
    assert_eq!(info.sheets.len(), 1);
    let sheet_name = info.sheets[0].name.clone();

    let request = XlsxPageRequest {
        path: path_str.clone(),
        sheet_name: sheet_name.clone(),
        start_row: 0,
        page_size: 1,
    };
    assert_eq!(read_xlsx_page(&request).unwrap().rows[0][0], "original");

    save_xlsx_patches(&XlsxSavePatchesRequest {
        path: path_str,
        patches: vec![XlsxCellPatch {
            sheet_name,
            row_index: 0,
            column_index: 0,
            value: "patched".to_owned(),
        }],
    })
    .unwrap();

    assert_eq!(read_xlsx_page(&request).unwrap().rows[0][0], "patched");
}

/// A corrupt workbook is untrusted input; parsing must return an error instead
/// of crashing the process. This is a sanity regression, not a full CFB/OLE
/// exploit fixture or a claim that the upstream advisory has been eliminated.
#[test]
fn malformed_xls_returns_error_instead_of_panicking() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("malformed.xls");
    std::fs::write(&path, b"corrupt OLE2 workbook fixture").unwrap();
    assert!(workbook_info(&path.to_string_lossy()).is_err());
}
