## Notes

TODO: Priority
- get monitor-tvl.ts running on server
- resolve outperforming 2 entries
- automate the pmf calculation (- assign weights to each metric)
- resolve issues with historical volumes getting set to 0 (Jakub has list)
    - explore the following weird fees and volume for (history id 2415, 1406)
- add an automatic calc volume function to take place after an execution
- figure out how to handle multiple embedded addresses for a single user in the analytics_users table (if applicable today)
- add and conform TVL growth into the PMF index
- fix the discord id's not populating properly in the CSVs
- update README.md
- ultimately conform growth files to functions in the underlying non-growth files
- instead of pulling from mixpanel, we should ultimately pull from the database for user profiles
- automate database population for analytics_users table
- separate analytics_utils into a separate repo and npm package
- action executed growth should pull execution data from mixpanel. we should also have a util for calculating 30 day executions

