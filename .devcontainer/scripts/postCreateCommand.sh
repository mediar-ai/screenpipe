#!/bin/bash

# Define the alias
ALIAS_CMD="alias test-linux=\"/workspaces/screenpipe/.devcontainer/scripts/linux_integration.sh\""

# Add alias to .bashrc if it exists
grep -qxF "$ALIAS_CMD" ~/.bashrc || echo "$ALIAS_CMD" >> ~/.bashrc

# Add alias to .zshrc if it exists
grep -qxF "$ALIAS_CMD" ~/.zshrc || echo "$ALIAS_CMD" >> ~/.zshrc
