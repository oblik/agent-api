Populate with information about what each analytics file does for future cleanup / categorization & documentation.

## analytics_utils (MAIN FOLDER)

- types.ts: Types for the analytics utils.

## archive_analytics

- analyze.py: Analyzes usage data for a specific cohort.
    - uses absolutes and uniques csvs to calculate points
- discord-analysis.ts: Analyzes discord data for a specific cohort.
- loyalty.ts: 
- loyaltyv2.ts:
- productVolume.ts: Calculates the volume of events for a specific cohort.
- retentionanalysis.ts: Analyzes retention data for a specific cohort.
- tracker.py: Tracks the usage of a specific cohort.
    - references wallets.csv to get wallet addresses
- usage.py: Analyzes usage data for a specific cohort.
    - references wallets.csv to get wallet addresses

## mixpanel_manipulation - files necessary to manipulate mixpanel data

- delete_mixpanel_data.py: Deletes mixpanel data for a specific cohort.
- transferEvents.ts: Transfers events from one user to another.

## pmf_index_calcs - files for analyzing Product-Market Fit metrics

- fees.ts: Analyzes transaction fee patterns to identify peak usage periods.
    - Queries and processes fee data from database
    - Calculates highest 30-day fee totals per user
    - Exports to CSV: distinct_id, name, max_fees, start_date, end_date, useraddress
- frequency.ts: Analyzes user activity patterns through Mixpanel events.
    - Fetches user profiles and event data from Mixpanel
    - Calculates peak 30-day activity windows
    - Exports to CSV: distinct_id, name, max_unique_event_days, start_date, end_date
- utils.ts: Utility functions for PMF analysis.
- tvl.ts: Analyzes the total value locked (TVL) for a specific cohort.
- volume.ts: Analyzes the volume of events for a specific cohort.

### pmf_index_storage/
Contains dated CSV output files from PMF analysis:
- fees_YYYY-MM-DD.csv: Daily fee analysis results
- frequency_YYYY-MM-DD.csv: Daily frequency analysis results

## user_onboarding - files necessary to onboard users to the app

- analytics_interface.ts: Interface for populating the database with user data.
