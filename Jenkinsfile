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
                if (fileExists('reports/unit-tests.xml')) {
                    junit testResults: 'reports/unit-tests.xml', allowEmptyResults: false
                }
            }
            archiveArtifacts artifacts: 'reports/*.xml,coverage/**', allowEmptyArchive: true
            deleteDir()
        }
    }
}
