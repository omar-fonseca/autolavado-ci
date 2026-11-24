pipeline {
  agent any

  triggers {
    pollSCM('H/5 * * * *')
  }

  options {
    timestamps()
  }

  environment {
    COMPOSE_PROJECT_NAME = "autolavado-ci-${BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

stage('Build and start Compose') {
      steps {
        bat '''
@echo off
"C:\\Program Files\\Git\\bin\\bash.exe" -c "sed -i 's/\\r$//' docker/mysql-init/01-create-users.sh && chmod +x docker/mysql-init/01-create-users.sh"
if errorlevel 1 exit /b 1
docker compose up -d --build
if errorlevel 1 exit /b 1
'''
      }
    }

    stage('Wait for app health') {
      steps {
        bat '''
@echo off
docker compose exec -T app node --input-type=module -e "for (let attempt = 1; attempt <= 60; attempt += 1) { try { const response = await fetch('http://127.0.0.1:3000/api/health'); if (response.ok) process.exit(0); } catch {} await new Promise((resolve) => setTimeout(resolve, 2000)); } console.error('La API no se encontro saludable en 120 segundos.'); process.exit(1);"
if errorlevel 1 exit /b 1
exit /b 0
'''
      }
    }

    stage('Verify API') {
      steps {
        bat 'docker compose exec -T -e VERIFY_BASE_URL=http://app:3000 app npm run test:ci'
      }
    }
  }

  post {
    always {
      bat 'docker compose logs db'
      bat 'docker compose down --remove-orphans --volumes'
    }
  }
}