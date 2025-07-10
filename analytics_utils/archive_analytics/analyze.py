import pandas as pd

# Set pandas display options
pd.set_option("display.max_rows", None)
pd.set_option("display.max_columns", None)

def normalize_protocol_name(protocol_name):
    words = protocol_name.split() if protocol_name and protocol_name != "?" else []
    return words[0] if words else None

def load_and_preprocess(file_path):
    data = pd.read_csv(file_path)
    data_cleaned = data.loc[:, ~data.columns.str.contains("^Unnamed")].copy()  # Avoid SettingWithCopyWarning
    data_cleaned["%"] = data_cleaned["%"].str.rstrip("%").astype("float") / 100.0
    data_cleaned["method"] = data_cleaned["method"].fillna("").astype(str).replace("?", "")
    if "avg_non_null_user_balance" in data.columns:
        data_cleaned["avg_non_null_user_balance"] = data["avg_non_null_user_balance"].fillna(0)
    else:
        data_cleaned["avg_non_null_user_balance"] = 0
    return data_cleaned

# Load data
data_uniques = load_and_preprocess("uniques.csv")
data_absolutes = load_and_preprocess("absolutes.csv")
data_uniques_3 = load_and_preprocess("uniques3.csv")
data_absolutes_3 = load_and_preprocess("absolutes3.csv")
data_uniques_new_3 = load_and_preprocess("uniquesnew3.csv")
data_absolutes_new_3 = load_and_preprocess("absolutesnew3.csv")

# Combine the datasets
combined_data = pd.concat([data_uniques, data_absolutes, data_uniques_3, data_absolutes_3, data_uniques_new_3, data_absolutes_new_3], ignore_index=True)

# Fill missing 'protocol' and 'method' labels
combined_data["protocol"] = combined_data.groupby("contract_address")["protocol"].transform(lambda x: x.bfill().ffill())
combined_data["method"] = combined_data.groupby("method_id")["method"].transform(lambda x: x.bfill().ffill())

# Filter and normalize protocol names
combined_data = combined_data[(combined_data["protocol"] != "?") & combined_data["protocol"].notna()]
combined_data["protocol_group"] = combined_data["protocol"].apply(normalize_protocol_name).dropna()

# Group by protocol group
combined_data_grouped = combined_data.groupby("protocol_group")

# Aggregations
protocol_methods = combined_data_grouped["method"].apply(lambda x: ", ".join(set(x[x != ""]))).reset_index(name="Methods")
protocol_points = combined_data_grouped["%"].sum().reset_index().rename(columns={"%": "Points"})
protocol_balances = combined_data_grouped["avg_non_null_user_balance"].sum().reset_index(name="Total Avg Balance")

# Multiply points by 100
protocol_points["Points"] *= 100

# Merge data
protocol_summary = pd.merge(protocol_points, protocol_methods, on="protocol_group")
protocol_summary = pd.merge(protocol_summary, protocol_balances, on="protocol_group")

# Sort and rank
protocol_summary_sorted = protocol_summary.sort_values(by="Points", ascending=False)
protocol_summary_sorted["Rank"] = protocol_summary_sorted["Points"].rank(method="first", ascending=False).astype(int)

# Final adjustments for display
protocol_summary_sorted = protocol_summary_sorted[
    ["Rank", "protocol_group", "Points", "Methods", "Total Avg Balance"]
].rename(columns={"protocol_group": "Protocol"})
print(protocol_summary_sorted.head(100).to_string(index=False))
