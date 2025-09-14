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

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
async function getUncachableGitHubClient() {
  if (!Octokit) {
    const octokitModule = await import('@octokit/rest');
    Octokit = octokitModule.Octokit;
  }
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function createRepository() {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get the authenticated user first
    const { data: user } = await octokit.rest.users.getAuthenticated();
    console.log(`Authenticated as: ${user.login}`);
    
    // Create the repository
    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: 'webwaka-main',
      description: 'WebWaka - Complete multi-tenant business management platform with POS system, inventory management, CRM, HRM, partner management, built with Next.js, PostgreSQL, and PWA capabilities.',
      private: false, // Set to true if you want a private repository
      auto_init: false, // Don't auto-initialize with README
    });
    
    console.log(`Repository created successfully: ${repo.html_url}`);
    console.log(`Clone URL: ${repo.clone_url}`);
    console.log(`SSH URL: ${repo.ssh_url}`);
    
    return repo;
  } catch (error) {
    if (error.status === 422 && error.response?.data?.errors?.[0]?.message?.includes('already exists')) {
      console.log('Repository already exists, that\'s fine!');
      // Get the existing repository
      const octokit = await getUncachableGitHubClient();
      const { data: user } = await octokit.rest.users.getAuthenticated();
      const { data: repo } = await octokit.rest.repos.get({
        owner: user.login,
        repo: 'webwaka-main'
      });
      return repo;
    } else {
      console.error('Error creating repository:', error.message);
      if (error.response?.data) {
        console.error('GitHub API Error:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
}

// Run the script
createRepository().then(repo => {
  console.log('✅ Repository setup complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Failed to create repository:', error.message);
  process.exit(1);
});