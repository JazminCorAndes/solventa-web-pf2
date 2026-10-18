import groovy.json.JsonOutput
import jenkins.model.Jenkins
import com.cloudbees.hudson.plugins.folder.Folder
import com.cloudbees.plugins.credentials.CredentialsProvider
import com.cloudbees.plugins.credentials.domains.Domain
import jenkins.branch.BranchSource
import jenkins.branch.BranchProperty
import jenkins.branch.DefaultBranchPropertyStrategy
import jenkins.branch.NoTriggerBranchProperty
import jenkins.branch.NoTriggerMultiBranchQueueDecisionHandler.SuppressionStrategy
import jenkins.scm.impl.trait.WildcardSCMHeadFilterTrait
import org.jenkinsci.plugins.github_branch_source.Connector
import org.jenkinsci.plugins.github_branch_source.GitHubAppCredentials
import org.jenkinsci.plugins.github_branch_source.GitHubSCMSource
import org.jenkinsci.plugins.github_branch_source.OriginPullRequestDiscoveryTrait
import io.jenkins.plugins.checks.github.status.GitHubSCMSourceStatusChecksTrait
import org.jenkinsci.plugins.workflow.multibranch.WorkflowBranchProjectFactory
import org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject

// Script confiable del controlador, no un paso del pipeline. No habilitar exploraciones ni compilaciones aqui.
def folder = Jenkins.get().getItem('solventa-web')
if (!(folder instanceof Folder)) throw new IllegalStateException('Expected existing web Folder')
def store = CredentialsProvider.lookupStores(folder).find { it.context == folder }
def credential = store?.getCredentials(Domain.global())?.find { it.id == 'solventa-web-github-app' }
if (!(credential instanceof GitHubAppCredentials) || credential.appID != '5277435') {
    throw new IllegalStateException('Expected dedicated web App in local folder store')
}
def connection = null
try {
    connection = Connector.connect('https://api.github.com', credential)
    def repository = connection.getRepository('JazminCorAndes/solventa-web-pf2')
    if (repository.fullName != 'JazminCorAndes/solventa-web-pf2') {
        throw new IllegalStateException('Unexpected web repository')
    }
} finally {
    if (connection != null) Connector.release(connection)
}

def description = 'Private on-demand checks for JazminCorAndes/solventa-web-pf2; activation pending'
def project = folder.getItem('pr-checks')
if (project == null) {
    project = folder.createProject(WorkflowMultiBranchProject, 'pr-checks')
} else if (!(project instanceof WorkflowMultiBranchProject) || project.description != description) {
    throw new IllegalStateException('Unrelated existing item; inspect before changing it')
}
project.makeDisabled(true)
if (!project.isDisabled()) throw new IllegalStateException('Web source must remain disabled')
def source = new GitHubSCMSource('JazminCorAndes', 'solventa-web-pf2', null, false)
source.setId('solventa-web-github')
source.setCredentialsId('solventa-web-github-app')
def checks = new GitHubSCMSourceStatusChecksTrait()
checks.setName('CI / Validación (Jenkins)')
checks.setSuppressLogs(true)
checks.setSkipNotifications(true)
source.setTraits([
    new OriginPullRequestDiscoveryTrait(1),
    new WildcardSCMHeadFilterTrait('PR-*', ''),
    checks,
])
def factory = new WorkflowBranchProjectFactory()
factory.setScriptPath('Jenkinsfile')
project.setProjectFactory(factory)
def suppression = new NoTriggerBranchProperty()
suppression.setStrategy(SuppressionStrategy.INDEXING)
suppression.setTriggeredBranchesRegex('^$')
def branchSource = new BranchSource(source)
branchSource.setStrategy(new DefaultBranchPropertyStrategy([suppression] as BranchProperty[]))
project.sourcesList.clear()
project.sourcesList.add(branchSource)
project.setDescription(description)
project.save()
println(JsonOutput.toJson([
    project: project.fullName,
    disabled: project.isDisabled(),
    credentialStore: 'solventa-web/folder',
    credentialId: source.credentialsId,
    repository: 'JazminCorAndes/solventa-web-pf2',
    checksName: 'CI / Validación (Jenkins)',
    childJobs: project.items.size(),
    scheduledScan: false,
]))
