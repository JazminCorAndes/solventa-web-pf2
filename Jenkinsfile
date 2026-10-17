pipeline {
    // Preparar y verificar esta etiqueta antes de habilitar el trabajo multirrama.
    agent { label 'web-ci' }

    options {
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
        skipDefaultCheckout(true)
        timestamps()
    }

    environment {
        CI = 'true'
        NG_CLI_ANALYTICS = 'false'
        PATH = "/opt/jenkins-web/node-v22.22.3-linux-x64/bin:/opt/jenkins-web/pnpm-11.19.0/bin:${env.PATH}"
        PNPM_STORE_DIR = "${WORKSPACE}/.pnpm-store"
    }

    stages {
        stage('Código') {
            steps {
                deleteDir()
                checkout scm
            }
        }
        stage('Herramientas') {
            steps {
                sh 'node scripts/verify-ci-toolchain.cjs'
            }
        }
        stage('Dependencias') {
            steps {
                sh 'pnpm install --frozen-lockfile --store-dir "$PNPM_STORE_DIR"'
            }
        }
        stage('Lint') {
            steps {
                sh 'pnpm lint'
            }
        }
        stage('Pruebas y cobertura') {
            steps {
                publishChecks name: 'Cobertura', status: 'IN_PROGRESS', conclusion: 'NONE', title: 'Generando cobertura web', summary: 'Código instrumentado por Angular/Vitest V8.', detailsURL: "https://github.com/JazminCorAndes/solventa-web-pf2/pull/${env.CHANGE_ID}/checks"
                sh 'python3 -m unittest discover -s scripts -p test_coverage_summary.py'
                sh 'mkdir -p reports && pnpm test:coverage'
            }
        }
        stage('Compilación') {
            steps {
                sh 'pnpm build'
            }
        }
    }

    post {
        always {
            script {
                try {
                    if (fileExists('reports/unit-tests.xml')) {
                        junit testResults: 'reports/unit-tests.xml', allowEmptyResults: false, skipPublishingChecks: true
                    }
                    def result = sh(returnStatus: true, script: '''python3 scripts/coverage_summary.py \
                        --coverage 'Web=coverage/solventa-web-pf2/cobertura-coverage.xml' \
                        --tests 'reports/unit-tests.xml' \
                        --scope 'Código instrumentado por Angular/Vitest V8. No incluye pruebas E2E ni servicios externos.'
                    ''')
                    def summary = readFile(file: 'reports/coverage-summary.md', encoding: 'UTF-8')
                    summary += "\nRevisión compilada (puede incluir merge con destino): `${env.GIT_COMMIT}`.\n"
                    publishChecks name: 'Cobertura', title: summary.readLines()[0], summary: summary,
                        detailsURL: "https://github.com/JazminCorAndes/solventa-web-pf2/pull/${env.CHANGE_ID}/checks",
                        conclusion: result == 0 ? 'SUCCESS' : (currentBuild.currentResult == 'SUCCESS' ? 'FAILURE' : 'NEUTRAL')
                    if (result != 0 && currentBuild.currentResult == 'SUCCESS') {
                        error('Faltan reportes válidos de cobertura o pruebas')
                    }
                } finally {
                    archiveArtifacts artifacts: 'reports/unit-tests.xml,reports/coverage-summary.md,coverage/**', allowEmptyArchive: true
                }
            }
        }
        cleanup {
            script {
                try {
                    // Mantener el check antiguo obligatorio hasta migrar las protecciones.
                    publishChecks name: 'CI / Validación (Jenkins)',
                        conclusion: currentBuild.currentResult == 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
                        title: currentBuild.currentResult == 'SUCCESS' ? 'Lint, pruebas y compilación correctos' : 'Validación incompleta o fallida',
                        summary: 'Validación solicitada con `/test-jenkins`. Porcentajes y pruebas en **Cobertura**. El check anterior se conserva temporalmente por las protecciones.',
                        detailsURL: "https://github.com/JazminCorAndes/solventa-web-pf2/pull/${env.CHANGE_ID}/checks"
                } finally {
                    deleteDir()
                }
            }
        }
    }
}
