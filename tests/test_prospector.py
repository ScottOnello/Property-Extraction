import unittest
from datetime import date

from anchorage_fourplex.prospector import epoch_millis_to_date, normalize_address, owner_type, prepare_records, score_record, years_owned


class ProspectorTests(unittest.TestCase):
    def test_years_owned_respects_anniversary(self):
        self.assertEqual(years_owned(date(2006, 8, 26), date(2026, 8, 26)), 20)
        self.assertEqual(years_owned(date(2006, 8, 27), date(2026, 8, 26)), 19)

    def test_epoch_conversion(self):
        self.assertEqual(epoch_millis_to_date(1010750400000), date(2002, 1, 11))
        self.assertIsNone(epoch_millis_to_date(None))

    def test_address_normalization(self):
        self.assertEqual(normalize_address("2011 Farmer Place"), normalize_address("2011 FARMER PL"))

    def test_owner_classification(self):
        self.assertEqual(owner_type("SISON LEONORA B & LAWRENCE V"), "individual_or_estate")
        self.assertEqual(owner_type("EXAMPLE HOLDINGS LLC"), "entity_or_government")
        self.assertEqual(owner_type("SMITH FAMILY TRUST"), "individual_or_estate")

    def test_scoring_is_transparent(self):
        row = {"Parcel_Address": "100 MAIN ST", "Owner_Address": "PO BOX 1", "Owner_State": "WA", "Owner_Name": "JANE OWNER", "Deed_Date": 631152000000, "YearBuilt_Min": 1975}
        scored = score_record(row, date(2026, 8, 26))
        self.assertEqual(scored["Opportunity_Score"], 100)
        self.assertTrue(scored["Absentee_Indicator"])
        self.assertTrue(scored["Out_Of_State_Indicator"])

    def test_filter_and_rank(self):
        rows = [
            {"Parcel_ID": "1", "Parcel_Address": "B", "Deed_Date": 631152000000, "Owner_Name": "A LLC"},
            {"Parcel_ID": "2", "Parcel_Address": "A", "Deed_Date": 1640995200000, "Owner_Name": "B"},
        ]
        all_rows, prospects = prepare_records(rows, date(2026, 8, 26), 20)
        self.assertEqual(len(all_rows), 2)
        self.assertEqual([row["Parcel_ID"] for row in prospects], ["1"])


if __name__ == "__main__":
    unittest.main()
