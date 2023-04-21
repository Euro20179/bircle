#!/bin/sh

echo "Creating necessary folders"
mkdir command-results command-perms
echo "Creating necessary files"
touch command-results/alias command-perms/blacklists command-perms/whitelists

mkdir data

printf "%s: " "Please enter your bot token"
read -r TOKEN
cat <<EOF > data/TOKEN
$TOKEN
EOF

printf "%s: " "Please enter the guild id you wish to run this bot in"
read -r GUILD_ID
cat <<EOF > data/GUILD_ID
$GUILD_ID
EOF

printf "%s: " "Please enter the client id of the bot"
read -r CLIENT_ID
cat <<EOF > data/CLIENT
$CLIENT_ID
EOF
