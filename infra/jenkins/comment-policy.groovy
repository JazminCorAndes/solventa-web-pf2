class SolventaWebCommentPolicy {
    static boolean canSchedule(boolean queued, boolean building) {
        !queued && !building
    }

    static boolean eligible(Map comment, long enabledAt, Collection<Long> processed) {
        comment.id instanceof Number &&
            comment.body instanceof String && comment.body.trim() == '/test-jenkins' &&
            comment.createdAt instanceof Number && comment.updatedAt instanceof Number &&
            comment.createdAt >= enabledAt && comment.createdAt == comment.updatedAt &&
            !processed.contains((comment.id as Number).longValue()) &&
            comment.human == true && comment.permission in ['ADMIN', 'WRITE', 'MAINTAIN'] &&
            comment.open == true && comment.origin == true && comment.target in ['develop', 'master']
    }
}
