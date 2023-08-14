#!/bin/python

import os
import json

print("Creating necessary folders")
for folder in ("command-results", "command-perms", "data"):
    os.mkdir(folder)
print("Creating necessary files")
for file in ("command-results/alias", "command-perms/blacklists", "command-perms/whitelists"):
    with open(file, "w") as f: pass

token = input("Please enter bot token")
guildId = input("Please enter the guild id")
clientId = input("Please enter the client id")
clientSecret = input("Please enter the client secret")
prefix = input("Enter the prefix, leave blank for '['")

data = {
    "general": {
        "prefix": prefix or "[",
        "admins": []
    },
    "secrets": {
        "token": token,
        "guild": guildId,
        "client-id": clientId,
        "client-secret": clientSecret,
        "valid-api-keys": []
        }
}

with open("CONFIG.json", "w") as f:
    json.dump(data, f)
