import io.jenkins.plugins.checks.github.status.GitHubSCMSourceStatusChecksTrait
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.multibranch.WorkflowMultiBranchProject

// Ejecutar en el controlador confiable; no desde código del PR.
def project = Jenkins.get().getItemByFullName('solventa-web/pr-checks')
if (!(project instanceof WorkflowMultiBranchProject) || project.sourcesList.size() != 1) {
    throw new IllegalStateException('Expected existing web multibranch project')
}
def source = project.sourcesList[0].source
if (source.repoOwner != 'JazminCorAndes' || source.repository != 'solventa-web-pf2') {
    throw new IllegalStateException('Unexpected repository')
}
def checks = source.traits.find { it instanceof GitHubSCMSourceStatusChecksTrait }
if (checks == null || checks.name != 'Solventa Web Jenkins') {
    throw new IllegalStateException('Inspect existing check/protections before changing reporting')
}
checks.setSkipNotifications(true)
project.save()
println('Legacy status notifications disabled; required check name preserved. No build scheduled.')
