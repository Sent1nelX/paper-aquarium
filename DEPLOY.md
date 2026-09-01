# Деплой

Аквариум — один контейнер: сервер на голом Node, порт 8000 внутри
докер-сети, наружу не пробрасывается. HTTPS, домен и сертификат — на
обратном прокси. Своего прокси в этом compose нет намеренно: на сервере,
где уже работают другие контейнеры, 80 и 443 заняты, и второй прокси туда
не встанет.

Данные — обычная папка `data/` рядом с проектом, пак моделей — папка
`pack/`, потому что в репозиторий он не входит.

## Что понадобится

- Сервер с докером: 1 ядро, 1 ГБ памяти, 20 ГБ диска. Хватает с запасом —
  зависимостей нет, память почти не ест, диск съедают только рисунки.
- **Traefik** (или любой другой прокси) с внешней docker-сетью `web`
  и резолвером `letsencrypt`. Проверить: `docker network ls | grep web`.
  Если прокси ещё нет — см. «Без Traefik» в конце.
- Домен и **A-запись** на адрес сервера.

## Один раз

**1. Код**

```bash
git clone https://github.com/MrMoT9I/paper-aquarium.git /opt/docker/apps/paper-aquarium
cd /opt/docker/apps/paper-aquarium
```

**2. Настройки**

```bash
cp .env.example .env
nano .env            # DOMAIN — обязательно
```

**3. Пак моделей**

В репозитории его нет (лицензия + бинарь). Два пути:

**а) Бесплатный CC0-пак — одной командой (проще):**

```bash
node tools/fetch-free-pack.js      # качает CC0-модели с poly.pizza в pack/
```

Собирает `pack/` с рыбами, акулой, скатом и кальмаром (Quaternius + Squid,
CC0). Рифовые виды делят обобщённые рыбьи тела — форма модели не совпадает
с силуэтом листа раскраски, но всё печатается, снимается и плавает. Акула,
скат и кальмар — со своими моделями (совпадают точно).

**б) Купленный пак (точные модели под каждый вид):**

```powershell
# у себя на Windows: FBX из купленного архива → glTF
powershell -ExecutionPolicy Bypass -File tools\convert-pack.ps1
# и на сервер (из папки проекта)
scp -r assets\models\pack mikalai@СЕРВЕР:/opt/docker/apps/paper-aquarium/pack
```

Проверить: `ls pack | wc -l` и `docker exec aqua wget -qO- localhost:8000/api/pack | head -c 200`.

**4. Папка данных**

Контейнер работает не под root, поэтому владельца надо проставить заранее:

```bash
mkdir -p data
chown -R 1000:1000 data
```

**5. Запуск**

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f aqua
```

В логе должно появиться «Аквариумы: http://localhost:8000/». Через
полминуты `https://aquarium.mrmot9i.com` открывается с сертификатом.

## Каждый день

```bash
cd /opt/docker/apps/paper-aquarium

# забрать изменения
git fetch --all --prune
git checkout main
git pull --ff-only

# пересобрать и поднять
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

# статус и логи
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail 200

# остановить (данные на месте)
docker compose -f docker-compose.prod.yml stop
```

Пересборка образа данные не трогает: аквариумы лежат в `./data`, пак —
в `./pack`, оба монтируются снаружи. Именованных томов у проекта нет,
так что `down -v` тут ничего не стирает — но привычки ради лучше
обходиться `stop`.

## Бэкап

Единственное, что нельзя потерять, — `data/`: там детские рисунки, имена
аквариумов и хеши паролей. Всё остальное восстанавливается из репозитория
и с твоего компьютера.

```bash
# /etc/cron.d/aqua-backup — раз в сутки, храним две недели
0 4 * * * root tar czf /var/backups/aqua-$(date +\%F).tgz \
          -C /opt/docker/apps/paper-aquarium data && \
          find /var/backups -name 'aqua-*.tgz' -mtime +14 -delete
```

И хотя бы раз в месяц копию с сервера к себе — `scp` или `rsync`. Бэкап,
который лежит на том же диске, что и данные, бэкапом не является.

## Журнал обращений

Сам аквариум журнала обращений не ведёт: в его лог попадает только
«в такой-то аквариум добавлена рыбка», без адресов. Но запросы идут через
прокси, и что видит посетитель в правилах — зависит уже от него.

Посмотри, включён ли у Traefik `--accesslog`:

```bash
docker inspect traefik --format '{{json .Config.Cmd}}' | tr ',' '\n' | grep -i log
```

Если включён — прокси пишет строку на каждый запрос: время, IP, адрес
страницы, код ответа. Это обычная практика, и страница «Правила и данные»
про такой журнал честно предупреждает. Дальше на выбор:

- оставить как есть (текст правил уже соответствует);
- убрать из журнала только адреса — флаг
  `--accesslog.fields.names.ClientHost=drop`;
- выключить журнал совсем — убрать `--accesslog=true`.

Два последних варианта — про весь прокси сразу, а не про один аквариум:
у Traefik нет фильтра «не логировать вот этот роутер». И проверь ротацию
докера (`/etc/docker/daemon.json`, `log-opts.max-size`): без неё журнал
растёт, пока не кончится диск.

## Что важно знать про доступ

Аквариум устроен так, что **ссылка = право смотреть и добавлять рыбок**,
а пароль нужен только на необратимое (удалить рыбок или аквариум,
переименовать, сменить пароль). Это сделано ради ребёнка: он открывает
съёмку с телефона по ссылке, и пароля у него нет.

Отсюда следствия для публичного сервера:

- Кто угодно может завести аквариум на твоём сервере. Ограничено:
  `AQUA_TANKS_PER_HOUR` (5 с адреса в час) и `AQUA_MAX_TANKS` (200 всего).
- Кто угодно со ссылкой на аквариум может залить туда картинки. Ограничено:
  `AQUA_MAX_FISH` (40 на аквариум), `AQUA_MAX_BG` (8 своих фонов),
  размером картинки (3 МБ рыбка, 6 МБ фон) и общим `AQUA_MAX_DATA_MB`.
- Все пределы меняются в `.env` без правки кода.

Счётчик «сколько аквариумов завели с адреса» смотрит на заголовок
`X-Forwarded-For` — его проставляет Traefik. Адрес живёт в памяти около
часа и на диск не попадает.

Если хочется, чтобы аквариум был только для своих, самый простой способ —
basic-auth на прокси, лейблами в `docker-compose.prod.yml`:

```yaml
- "traefik.http.middlewares.aqua-auth.basicauth.users=мама:$$2y$$05$$..."
- "traefik.http.routers.aqua.middlewares=aqua-compress,aqua-auth"
```

Хеш: `htpasswd -nb мама пароль`, доллары в compose удваиваются. Только
помни: тогда пароль спросят и у ребёнка на съёмке, и у телевизора.

## Если что-то не так

| Симптом | Куда смотреть |
|---|---|
| Сайт не открывается, 404 от прокси | `docker compose -f docker-compose.prod.yml ps`; контейнер должен быть в сети `web`: `docker inspect aqua --format '{{json .NetworkSettings.Networks}}'` |
| Сертификат не выписался | логи Traefik; чаще всего A-запись не доехала или 80 порт закрыт |
| Аквариум пустой, рыбок нет | пак не скопирован: `ls pack`, `docker exec aqua wget -qO- localhost:8000/api/pack \| head -c 200` |
| «сервер недоступен» на странице | `docker compose -f docker-compose.prod.yml logs aqua` |
| Не сохраняются аквариумы | владелец `data/`: `ls -ln data` — должен быть 1000:1000 |
| Кончилось место | `du -sh data`, потом `AQUA_MAX_DATA_MB` или чистка `data/trash-tanks` |

## Без Traefik

Если прокси на сервере ещё нет, самый короткий путь — поднять его один раз
рядом, отдельным compose, и завести сеть `web`:

```bash
docker network create web
```

Дальше любой гайд по Traefik + Let's Encrypt: аквариуму нужны только
внешняя сеть `web`, entrypoint `websecure` и резолвер с именем
`letsencrypt` — имена зашиты в лейблы и меняются там же.

## За Cloudflare Tunnel (без своего прокси)

Если у домена DNS на Cloudflare, а на сервере нет открытых портов (или 80/443
уже заняты), аквариум поднимается вообще без Traefik/Caddy: `cloudflared`
держит исходящее соединение к краю Cloudflare, а HTTPS и сертификат — там же.
Файл — `docker-compose.tunnel.yml`, туннель ведёт прямо в `aqua:8000`.

```bash
# 1. Код и папки
git clone https://github.com/Sent1nelX/paper-aquarium.git /home/$USER/apps/paper-aquarium
cd /home/$USER/apps/paper-aquarium
mkdir -p data pack && sudo chown -R 1000:1000 data pack

# 2. Туннель (один раз)
cloudflared tunnel login                          # авторизация в аккаунте Cloudflare
cloudflared tunnel create aqua                    # → пишет <id>.json в ~/.cloudflared
cp ~/.cloudflared/<id>.json cloudflared/          # креды рядом с конфигом
chmod 644 cloudflared/<id>.json                   # контейнер cloudflared читает как uid 65532
cp cloudflared/config.example.yml cloudflared/config.yml
nano cloudflared/config.yml                        # tunnel: <id>, hostname: ВАШ.ДОМЕН
cloudflared tunnel route dns aqua ВАШ.ДОМЕН        # DNS-запись CNAME на туннель

# 3. Запуск
docker compose -f docker-compose.tunnel.yml up -d --build
docker compose -f docker-compose.tunnel.yml logs -f
```

Обновление и статус — те же команды, что и выше, только с
`-f docker-compose.tunnel.yml`. Автозапуск после ребута обеспечивают
`restart: unless-stopped` + включённый в systemd docker — отдельный unit не нужен.

Настоящий адрес посетителя за Cloudflare приходит в `CF-Connecting-IP`
(подделать нельзя — заголовок ставит край CF), и счётчики лимитов берут его:
`X-Forwarded-For` за туннелем клиент может прислать сам.

### Бэкап данных (cron)

```bash
# /etc/cron.d/aqua-backup — ежедневно в 4:00, храним две недели
0 4 * * * <user> tar czf /home/<user>/backups/aqua-$(date +\%F).tgz \
          -C /home/<user>/apps/paper-aquarium data && \
          find /home/<user>/backups -name 'aqua-*.tgz' -mtime +14 -delete
```

### Ротация docker-логов

В `docker-compose.tunnel.yml` ротация уже задана на самих контейнерах
(`logging: max-size 10m, max-file 3`) — на сервере с чужими контейнерами это
безопаснее, чем общий `daemon.json`, который требует рестарта докера.

Если хочется одну настройку на все контейнеры сразу — `/etc/docker/daemon.json`
(без неё json-лог контейнера растёт до конца диска):

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

`sudo systemctl restart docker` — применяет ко всем контейнерам.
