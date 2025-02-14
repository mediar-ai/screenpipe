import { API_BASE_URL } from '../../../constants';
import { colors, symbols } from '../../../utils/colors';
import { Credentials } from '../../../utils/credentials';
import { handleError } from '../../components/commands/add/utils/handle-error';
import { logger } from '../../components/commands/add/utils/logger';

export async function apiKeyLogin(apiKey: string) {
    try {
        logger.info(`\n${symbols.info} validating API key...`);
  
        const response = await fetch(`${API_BASE_URL}/api/plugins/dev-status`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
              message: 'enter your developer name:',
              validate: (input: string) => {
                if (input.length < 2) {
                  return 'developer name must be at least 2 characters';
                }
                if (input.length > 50) {
                  return 'developer name must be less than 50 characters';
                }
                return true;
              }
            }
          ]);
  
          const updateResponse = await fetch(`${API_BASE_URL}/api/plugins/dev-status`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ developer_name: developerName }),
          });
  
          if (!updateResponse.ok) {
            const error = await updateResponse.json();
            throw new Error(`failed to set developer name: ${error.error}`);
          }
          
          const updateData = await updateResponse.json();
          data.data.developer_name = updateData.data.developer_name;
        }
  
        logger.info(`\n${symbols.success} successfully logged in!`);
        console.log(colors.listItem(`${colors.label('developer id')} ${data.data.developer_id}`));
        console.log(colors.listItem(`${colors.label('developer name')} ${data.data.developer_name}`));
        Credentials.setApiKey(apiKey, data.data.developer_id);
    } catch (error) {
        if (error instanceof Error) {
          handleError(`\n${symbols.error} login failed: ${error.message}`);
        } else {
          handleError(`\n${symbols.error} login failed with unexpected error`);
        }
        process.exit(1);
    }
}