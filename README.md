# Amazing bot, trust me guys

lol

## Setup

Run `setup.py`

or

Create a file calle `CONFIG.json`, the json must have the following items

```json
{
    "general": {
        "default-channel": "channel-id",
        "prefix": "prefix",
        "mode": "dev (optional)",
        "admins": ["admin-ids"],
    },
    "secrets": {
        "token": "bot token",
        "client-id": "bot client id",
        "client-secret": "application client secret",
        "guild": "guild id",
    }
}
```

extra items:
```json
{
    "general": {
        "enable-chat": boolean
    }
}
```
