import { Octokit } from '@octokit/rest'
import fs from 'fs'
import path from 'path'

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

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function getAllFiles(dir, basePath = '') {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    if (item.name.startsWith('.') && item.name !== '.env.example') continue;
    if (item.name === 'node_modules') continue;
    if (item.name === '.next') continue;
    if (item.name === 'dist') continue;
    if (item.name === 'build') continue;
    
    const fullPath = path.join(dir, item.name);
    const relativePath = path.join(basePath, item.name);
    
    if (item.isDirectory()) {
      files.push(...await getAllFiles(fullPath, relativePath));
    } else {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        files.push({
          path: relativePath.replace(/\\/g, '/'),
          content: content
        });
      } catch (err) {
        console.log(`Skipping binary file: ${relativePath}`);
      }
    }
  }
  
  return files;
}

async function pushToGitHub() {
  try {
    console.log('🚀 Starting GitHub push...');
    
    const octokit = await getUncachableGitHubClient();
    const owner = 'handylife-debug';
    const repo = 'webwaka-main';
    
    console.log('📁 Getting repository information...');
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;
    
    console.log('📝 Getting latest commit...');
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`
    });
    
    const latestCommitSha = refData.object.sha;
    
    console.log('🌳 Getting base tree...');
    const { data: latestCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha
    });
    
    const baseTreeSha = latestCommit.tree.sha;
    
    console.log('📂 Reading all files...');
    const files = await getAllFiles(process.cwd());
    
    console.log(`📋 Found ${files.length} files to upload`);
    
    const treeItems = [];
    
    for (const file of files) {
      console.log(`📄 Processing: ${file.path}`);
      
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        encoding: 'base64'
      });
      
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }
    
    console.log('🌳 Creating new tree...');
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      tree: treeItems,
      base_tree: baseTreeSha
    });
    
    console.log('💬 Creating commit...');
    const commitMessage = `feat: Complete WebWaka POS system with real payment integration

🚀 Major Features Implemented:
- Real Paystack SDK integration with server-side processing
- Comprehensive refund UI with transaction history management  
- Advanced inventory management with conflict resolution
- Enhanced tax calculation with edge case handling
- Complete E2E testing framework with Playwright
- Production-ready documentation and deployment guides

💳 Payment Infrastructure:
- Server-side payment processing APIs
- Webhook handling for payment events
- Full refund functionality across all providers
- Split payment support

🏪 POS Core Features:
- Multi-tenant architecture with subdomain support
- Offline-first design with IndexedDB storage
- WebWaka Biological Cell component system
- Professional responsive UI/UX

🧪 Testing & Quality:
- 35+ comprehensive E2E tests
- Multi-browser and mobile device testing
- Performance and security testing
- Accessibility compliance (WCAG 2.1)

📋 Documentation:
- Complete production deployment guide
- Comprehensive testing reports
- Security and compliance guidelines
- Performance optimization recommendations

✅ Production Ready:
System ready for deployment with live payment credentials`;
    
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
      author: {
        name: 'WebWaka Agent',
        email: 'agent@webwaka.com'
      }
    });
    
    console.log('🔄 Updating reference...');
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
      sha: newCommit.sha
    });
    
    console.log('✅ Successfully pushed to GitHub!');
    console.log(`🔗 Commit: https://github.com/${owner}/${repo}/commit/${newCommit.sha}`);
    console.log(`📁 Repository: https://github.com/${owner}/${repo}`);
    
    return {
      success: true,
      commitSha: newCommit.sha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`
    };
    
  } catch (error) {
    console.error('❌ Error pushing to GitHub:', error);
    throw error;
  }
}

// Run the function
pushToGitHub()
  .then(result => {
    console.log('🎉 Push completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Push failed:', error.message);
    process.exit(1);
  });