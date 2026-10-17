import jenkins.model.Jenkins
import jenkins.util.Timer
import java.util.concurrent.TimeUnit

// Reintentar la conexion tras el apagado por inactividad y el arranque. Sin secretos, cambios en EC2 ni ejecutores nuevos.
Timer.get().scheduleWithFixedDelay({
    def controller = Jenkins.get()
    def computer = controller.getComputer('android-aws')
    if (computer == null || !computer.offline || computer.temporarilyOffline || computer.connecting) return
    boolean requested = controller.queue.items.any { item ->
        def path = new URI(item.task.url ?: '').path
        if (!path.startsWith('/')) path = '/' + path
        path.startsWith('/job/solventa-android/') || path.startsWith('/job/solventa-web/job/pr-checks/')
    }
    if (requested) computer.connect(false)
} as Runnable, 30, 60, TimeUnit.SECONDS)
