// Use dynamic import for ES modules
let Octokit;

let connectionSettings;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const fetch = (await import('node-fetch')).default;
  
  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getGitHubUsername() {
  if (!Octokit) {
    const octokitModule = await import('@octokit/rest');
    Octokit = octokitModule.Octokit;
  }
  const accessToken = await getAccessToken();
  const octokit = new Octokit({ auth: accessToken });
  
  const { data: user } = await octokit.rest.users.getAuthenticated();
  return user.login;
}

async function pushToGitHub() {
  try {
    const accessToken = await getAccessToken();
    const username = await getGitHubUsername();
    
    console.log(`Authenticated as: ${username}`);
    console.log('Preparing to push to GitHub...');
    
    // Use the token in the URL for authentication
    const remoteUrl = `https://${username}:${accessToken}@github.com/${username}/webwaka-main.git`;
    
    return remoteUrl;
  } catch (error) {
    console.error('Error getting GitHub credentials:', error.message);
    throw error;
  }
}

// Export for shell usage
pushToGitHub().then(remoteUrl => {
  console.log('Use this URL to push:');
  console.log(`git push ${remoteUrl} main`);
  
  // Save to environment variable
  process.env.GITHUB_REMOTE_URL = remoteUrl;
  console.log('GitHub remote URL is ready for use');
  process.exit(0);
}).catch(error => {
  console.error('❌ Failed to prepare GitHub push:', error.message);
  process.exit(1);
});