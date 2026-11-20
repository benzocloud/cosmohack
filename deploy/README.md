# Развёртывание BenzoLens через Docker Compose

Запускайте Compose из корня репозитория. PostgreSQL, миграции, ML и Go работают в выделенной сети `cosmohack`. На хост публикуется HTTP-порт Go. Go запускается после успешных миграций и прохождения ML-проверки `/readyz`.

## Настройка

```bash
cp .env.compose.example .env.compose
cp deploy/go/.env.example deploy/go/.env
cp deploy/postgres/.env.example deploy/postgres/.env
cp deploy/postgres/client/.env.example deploy/postgres/client/.env
chmod 600 deploy/go/.env deploy/postgres/.env deploy/postgres/client/.env
```

- В `.env.compose` задаются образы Go и ML, версия модели, адрес и порт публикации HTTP, пути к env-файлам и SQL-миграциям. Пути отсчитываются от корня репозитория. Для локальной сборки используйте команды из [README](../README.md#быстрый-запуск-всего-решения). Для опубликованных образов возьмите пару `GO_IMAGE` и `ML_IMAGE` по digest из сводки GitHub Actions и версию из [manifest модели](../backend/ml/model-manifest.json) соответствующего коммита.
- В `deploy/go/.env` задаются OAuth-пара CDSE и необязательные настройки Go из [README](../README.md#конфигурация).
- В `deploy/postgres/.env` задаются имя базы, пользователь и пароль PostgreSQL. В `deploy/postgres/client/.env` укажите те же данные в `DATABASE_URL`. Внутри Compose адрес базы — `postgres:5432`. Зарезервированные символы пароля в DSN нужно кодировать по правилам URL.

Значения с символом `$` в env-файлах заключайте в одинарные кавычки. Файлы с рабочими секретами держите на хосте с правами `0600`.

## Запуск и обновление

Для приватных образов сначала войдите в GHCR с доступом на чтение пакетов. После выбора версии выполните:

```bash
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose pull
docker compose --env-file .env.compose up -d --wait
docker compose --env-file .env.compose ps
curl -fsS http://localhost:8080/readyz
```

При использовании локально собранных образов вместо общего `pull` загрузите только `postgres` и `migrate`. Для следующего выпуска замените оба digest и `MODEL_VERSION` вместе. При возврате образов на предыдущую версию предварительно проверьте её совместимость с уже применёнными миграциями.

## Переход с прежнего Compose

Если использовали `deploy/postgres/client.env`, перенесите его в `deploy/postgres/client/.env` и обновите `DATABASE_ENV_FILE` в `.env.compose`.

Узнайте имя прежнего проекта и тома PostgreSQL перед переключением. По умолчанию новый проект называется `cosmohack`. Если старый локальный стек запускался из `deploy/` и использует том `deploy_postgres-data`, укажите `-p deploy` во всех командах Compose. Для другого имени проекта используйте его через `-p`. Так Compose подключит прежний том с уже инициализированной базой.

Перенесите действующие настройки PostgreSQL и CDSE в новые файлы окружения. На существующем томе пароль меняется в самой БД. При смене имени проекта или переносе данных на другой хост сначала сделайте резервную копию. Остановка через `docker compose --env-file .env.compose down` сохраняет том.
