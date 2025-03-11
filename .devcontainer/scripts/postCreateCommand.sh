echo "Welcome to Screenpipe!"

echo "We have set up an alias 'test-linux' for 'linux_integration.sh' in your shell configurations."
echo "You can use 'test-linux' to check if the Linux build of the app is working."

# Define the alias
ALIAS_CMD="alias test-linux=\"/workspaces/screenpipe/.devcontainer/scripts/linux_integration.sh\""

# Add alias to .bashrc if it exists
grep -qxF "$ALIAS_CMD" ~/.bashrc || echo "$ALIAS_CMD" >> ~/.bashrc

# Add alias to .zshrc if it exists
grep -qxF "$ALIAS_CMD" ~/.zshrc || echo "$ALIAS_CMD" >> ~/.zshrc
