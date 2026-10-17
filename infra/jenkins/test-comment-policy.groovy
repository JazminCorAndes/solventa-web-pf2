def policy = new GroovyClassLoader().parseClass(new File('infra/jenkins/comment-policy.groovy'))
def valid = [id: 42L, body: '/test-jenkins', createdAt: 100L, updatedAt: 100L,
             human: true, permission: 'WRITE', open: true, origin: true, target: 'develop']
assert policy.eligible(valid, 90L, [])
assert policy.canSchedule(false, false)
for (busy in [[true, false], [false, true], [true, true]]) {
    assert !policy.canSchedule(busy[0], busy[1])
    assert policy.eligible(valid, 90L, []) // La solicitud sigue pendiente, no consumida.
}
assert policy.eligible(valid + [body: ' /test-jenkins\n', permission: 'ADMIN', target: 'master'], 90L, [])
assert policy.eligible(valid + [permission: 'MAINTAIN'], 90L, [])
for (change in [[body: '/test-jenkins extra'], [human: false], [permission: 'READ'], [permission: 'NONE'],
                [origin: false], [open: false], [target: 'feature/login'], [updatedAt: 101L],
                [createdAt: 89L, updatedAt: 89L], [body: null], [id: null]]) {
    assert !policy.eligible(valid + change, 90L, [])
}
assert !policy.eligible(valid, 90L, [42L])
println('Web authorization and queue policy assertions passed')
