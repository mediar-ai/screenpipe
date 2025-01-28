import { command, string } from "@drizzle-team/brocli";
import { API_BASE_URL } from "../constants";
import { Credentials } from "../utils/credentials";
import { colors, symbols } from "../utils/colors";

export const loginCommand = command({
  name: "login",
  options: {
    apiKey: string().required().desc("API key to login with"),
  },
  handler: async (opts) => {
    try {
      console.log(colors.info(`\n${symbols.info} Validating API key...`));

      const response = await fetch(`${API_BASE_URL}/api/plugins/dev-status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to validate API key ${error.error}`);
      }

      const data = await response.json();
      
      if (data.data.needs_name) {
        const inquirer = (await import('inquirer')).default;
        
        const { developerName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'developerName',
            message: 'Enter your developer name:',
            validate: (input: string) => {
              if (input.length < 2) {
                return 'Developer name must be at least 2 characters';
              }
              if (input.length > 50) {
                return 'Developer name must be less than 50 characters';
              }
              return true;
            }
          }
        ]);

        const updateResponse = await fetch(`${API_BASE_URL}/api/plugins/dev-status`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ developer_name: developerName }),
        });

        if (!updateResponse.ok) {
          const error = await updateResponse.json();
          throw new Error(`Failed to set developer name: ${error.error}`);
        }
        
        const updateData = await updateResponse.json();
        data.data.developer_name = updateData.data.developer_name;
      }

      console.log(colors.success(`\n${symbols.success} Successfully logged in!`));
      console.log(colors.listItem(`${colors.label('Developer ID')} ${data.data.developer_id}`));
      console.log(colors.listItem(`${colors.label('Developer Name')} ${data.data.developer_name}`));
      Credentials.setApiKey(opts.apiKey, data.data.developer_id);

    } catch (error) {
      if (error instanceof Error) {
        console.error(colors.error(`\n${symbols.error} Login failed: ${error.message}`));
      } else {
        console.error(colors.error(`\n${symbols.error} Login failed with unexpected error`));
      }
      process.exit(1);
    }
  }
});
