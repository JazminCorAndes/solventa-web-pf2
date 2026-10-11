import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import hudson.model.Cause
import hudson.model.CauseAction
import hudson.security.ACL
import jenkins.model.Jenkins
import jenkins.scm.api.SCMRevisionAction
import jenkins.util.Timer
import org.jenkinsci.plugins.github_branch_source.Connector
import org.jenkinsci.plugins.github_branch_source.PullRequestSCMRevision
import org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject
import org.kohsuke.github.GHIssueState
import java.util.concurrent.TimeUnit
import java.util.logging.Logger

// Install once as a trusted initializer after lifecycle/toolchain approval, not in a workspace.
def controller = Jenkins.get()
def configFile = new File(controller.rootDir, 'web-comment-trigger.json')
if (!configFile.isFile()) return
def policy = new GroovyClassLoader(getClass().classLoader).parseClass(new File('/opt/jenkins-web/comment-policy.groovy'))
def stateFile = new File(controller.rootDir, 'web-comment-trigger-state.json')
def logger = Logger.getLogger('solventa.web-comment-trigger')
Timer.get().scheduleWithFixedDelay({
    def connection = null
    def systemContext = ACL.as2(ACL.SYSTEM2)
    try {
        def config = new JsonSlurper().parse(configFile)
        if (config.enabled != true) return
        if (config.owner != 'JazminCorAndes' || config.repository != 'solventa-web-pf2' ||
            config.credentialId != 'solventa-web-github-app') throw new IllegalStateException('Unexpected web configuration')
        def project = controller.getItemByFullName('solventa-web/pr-checks')
        if (!(project instanceof WorkflowMultiBranchProject) || project.isDisabled()) return
        if (!stateFile.isFile()) {
            stateFile.text = JsonOutput.toJson([enabledAt: System.currentTimeMillis(), processed: []])
        }
        def state = new JsonSlurper().parse(stateFile)
        def processed = state.processed.collect { (it as Number).longValue() }
        def credential = Connector.lookupScanCredentials(project, 'https://api.github.com', config.credentialId as String, config.owner as String)
        if (credential == null || credential.appID != '5277435') throw new IllegalStateException('Dedicated web credential missing')
        connection = Connector.connect('https://api.github.com', credential)
        def repository = connection.getRepository('JazminCorAndes/solventa-web-pf2')
        repository.getPullRequests(GHIssueState.OPEN).each { pull ->
            boolean origin = pull.head.repository?.fullName == 'JazminCorAndes/solventa-web-pf2'
            if (!origin || !(pull.base.ref in ['develop', 'master'])) return
            new ArrayList(pull.listComments().toList()).sort { it.id }.each { comment ->
                long id = comment.id
                if (processed.contains(id) || comment.body?.trim() != '/test-jenkins') return
                long created = comment.createdAt.time
                long updated = comment.updatedAt.time
                if (created < (state.enabledAt as Number).longValue() || created != updated) return
                def user = comment.user
                def info = [id: id, body: comment.body, createdAt: created, updatedAt: updated,
                            human: user.type == 'User', permission: repository.getPermission(user.login).toString(),
                            open: true, origin: origin, target: pull.base.ref]
                if (!policy.eligible(info, (state.enabledAt as Number).longValue(), processed)) return
                def job = project.getItem('PR-' + pull.number)
                if (job == null) { project.scheduleBuild2(0); return }
                def branch = project.getProjectFactory().getBranch(job)
                def source = project.getSCMSource(branch.sourceId)
                def revision = source.fetch(branch.head, null)
                if (!(revision instanceof PullRequestSCMRevision) || revision.pullHash != pull.head.sha) return
                def request = job.scheduleBuild2(0,
                    new CauseAction(new Cause.RemoteCause('github-comment', "Requested by ${user.login} through PR comment ${id} for ${revision.pullHash}")),
                    new SCMRevisionAction(source, revision))
                if (request != null) {
                    processed.add(id)
                    state.processed = processed
                    stateFile.text = JsonOutput.toJson(state)
                    logger.info("Queued web PR ${pull.number} from comment ${id} for ${revision.pullHash}")
                }
            }
        }
    } catch (Exception failure) {
        // No messages, tokens, keys or request bodies in logs.
        logger.warning('Web comment scan failed: ' + failure.class.name)
    } finally {
        if (connection != null) Connector.release(connection)
        systemContext.close()
    }
} as Runnable, 30, 60, TimeUnit.SECONDS)
