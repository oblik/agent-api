import requests

project_token = "e73b9a92b8de6d674a4e33a4d8817e48"
url = "https://api.mixpanel.com/engage#profile-delete"

payload = [
    {
        "$token": project_token,
        "$distinct_id": "f10c6d26-aa98-4fa6-a10e-bd9e9694b5b6",
        "$delete": "null",
        "$ignore_alias": False
    }
]

headers = {
    "accept": "text/plain",
    "content-type": "application/json"
}

response = requests.post(url, json=payload, headers=headers)

if response.status_code == 200:
    print(response.text)
else:
    print(f"Error: {response.status_code} - {response.text}")
    print("Full response content:")
    print(response.content)