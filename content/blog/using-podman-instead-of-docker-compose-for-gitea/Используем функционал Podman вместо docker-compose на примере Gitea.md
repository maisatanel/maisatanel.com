+++
title = "Using Podman instead of docker-compose for Gitea (in Russian)"
date = "2022-12-15T06:18:00Z"

#
# description is optional
#
# description = "An optional description for SEO. If not provided, an automatically created summary will be used."

tags = []
+++

This is an article I've written a while ago detailing the concept of pods within Podman. Note that this was written before Quadlet was merged into mainstream Podman. It would make more sense to write about converting a docker-compose definition to Quadlet nowadays.

[Originally I wrote this article for habr.com.](https://habr.com/en/articles/705614/)

---

# Используем функционал Podman вместо docker-compose на примере Gitea

В своем порыве использовать только технологии компании Red Hat, я решила освоить их first-party контейнерный стек. В основе стека лежит `podman`- движок для контейнеров, работающий без демон-процесса и без root привилегий по умолчанию. `podman`интегрируется в экосистему Red Hat - запуск контейнеров производится посредством `systemd` ; контейнеры интегрируются с SELinux. Конечно, самая главная причина использовать `podman`вместо Docker - его включение по умолчанию в дистрибутив Red Hat Enterprise Linux и подобные.

### podman-compose

Здесь я описываю свой опыт прежде всего как энтузиаст, разворачивающий контейнеры в "homelab" среде. Для своих VCS нужд мне стал необходим инстанс Gitea. В [официальной документации](https://docs.gitea.io/en-us/install-with-docker-rootless/) описывается пример установки с Docker с использованием `docker-compose`.

У Podman существует совместимый сервис `podman-compose`, но он является неофициальной community разработкой. Он не входит в AppStream репозиторий RHEL, необходимо подключать EPEL. Становится ясно, что вместо `compose`в `podman`принято использовать функционал `pod`(даже в имени есть). Как им пользоваться?

### podman pod

Контейнеры в Podman разворачиваются в режиме rootless. Linux пользователи без root привилегий не могут создавать новые сетевые интерфейсы, поэтому для rootless контейнеров используется система [Slirp4netns](https://github.com/containers/podman/blob/main/docs/tutorials/basic_networking.md#slirp4netns). Slirp4netns создает TAP интерфейс внутри пространства имен (namespace) контейнера, подключая его к TCP/IP стеку хоста.

![](https://habrastorage.org/r/w1560/getpro/habr/upload_files/169/ae9/67a/169ae967aed98a04aef335ddffb531c6.png)Недостаток этого подхода заключается в отсутствии прямой связи между контейнерами. Из одного rootless контейнера необходимо обращаться к другому, используя IP хоста.

Прямую связь между rootless контейнерами можно организовать с `podman pod`:

![](https://habrastorage.org/r/w1560/getpro/habr/upload_files/7c2/324/b77/7c2324b7796ef9d4b68246adabaadf96.png)Внутри `pod`используется одно пространство имен, которое используют все контейнеры, а значит, все они используют один и тот же IP адрес, MAC адрес и port mapping. Контейнер может обратиться к другому через localhost.

Более полное описание сети в Podman можно найти на GitHub: <https://github.com/containers/podman/blob/main/docs/tutorials/basic_networking.md>

### Создаем pod для Gitea

Создать `pod`с именем `gitea`можно командой `podman pod create --name gitea -p 3000:3000 -p 2222:22`. Проверим его наличие:


```
[user@localhost ~]$ podman pod list
POD ID        NAME        STATUS      CREATED        INFRA ID      # OF CONTAINERS
d38b33e5e047  gitea       Created     6 seconds ago  62511c70363d  1
```
Конфигурация портов задается при создании `pod`.

### Добавляем СУБД контейнер в pod

В официальной документации Gitea есть конфигурация для создания базы данных на основе различных СУБД. Ради примера возьмем MySQL. Конфигурация выглядит [так](https://docs.gitea.io/en-us/install-with-docker-rootless/#mysql-database): 


```yaml
db:
  image: mysql:8
  restart: always
  environment:
    - MYSQL_ROOT_PASSWORD=gitea
    - MYSQL_USER=gitea
    - MYSQL_PASSWORD=gitea
    - MYSQL_DATABASE=gitea
  volumes:
     - ./mysql:/var/lib/mysql
```
Адаптируем эту конфигурацию в одну строку `podman run`:

`podman run -d -it --pod gitea --name gitea-db -e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_USER=gitea -e MYSQL_PASSWORD=gitea -e MYSQL_DATABASE=gitea -v gitea-db-volume:/var/lib/mysql:Z docker.io/library/mysql:8`

Разбор команды по очереди:

* `podman run` - создать и запустить контейнер;
* `-d -it` - запустить контейнер на фоне;
* `--pod gitea` - `pod`, в который встраивается контейнер;
* `--name gitea-db` - название контейнера;
* `-e MYSQL_RANDOM_ROOT_PASSWORD=yes -e MYSQL_USER=gitea -e MYSQL_PASSWORD=gitea -e MYSQL_DATABASE=gitea` - задаем те же переменные, что в compose файле (root пароль базы данных задается случайным; необходимо заменить пароль базы данных gitea);
* `-v gitea-db-volume:/var/lib/mysql:Z` - создаем том для базы данных. Названный том `gitea-db-volume`, как и остальные названные тома, хранятся в `.local/share/containers/storage/volumes`. `:Z`необходимо для работы с SELinux;
* `docker.io/library/mysql:8` - образ MySQL.

`restart: always` не необходим, так как за запуск контейнеров будет отвечать `systemd`.

Проверим работу контейнера:


```
[user@localhost ~]$ podman ps --pod
CONTAINER ID  IMAGE                                    COMMAND     CREATED         STATUS            PORTS                                         NAMES               POD ID        PODNAME
62511c70363d  localhost/podman-pause:4.3.1-1668180253              54 seconds ago  Up 6 seconds ago  0.0.0.0:2222->22/tcp, 0.0.0.0:3000->3000/tcp  d38b33e5e047-infra  d38b33e5e047  gitea
57478a1ad761  docker.io/library/mysql:8                mysqld      5 seconds ago   Up 6 seconds ago  0.0.0.0:2222->22/tcp, 0.0.0.0:3000->3000/tcp  gitea-db            d38b33e5e047  gitea
```
Контейнер `gitea-db`работает внутри `gitea`.

### Добавляем контейнер с Gitea

Смотрим [ту же конфигурацию](https://docs.gitea.io/en-us/install-with-docker-rootless/#mysql-database), но уже для контейнера Gitea:


```yaml
server:
  image: gitea/gitea:1.17.3-rootless
  environment:
    - GITEA__database__DB_TYPE=mysql
    - GITEA__database__HOST=db:3306
    - GITEA__database__NAME=gitea
    - GITEA__database__USER=gitea
    - GITEA__database__PASSWD=gitea
  restart: always
  volumes:
    - ./data:/var/lib/gitea
    - ./config:/etc/gitea  
    - /etc/timezone:/etc/timezone:ro
    - /etc/localtime:/etc/localtime:ro
  ports:
    - "3000:3000"
    - "222:22"
  depends_on:
    - db
```
Принцип действия такой же, как и в строке выше:

`podman run -d -it --pod gitea --name gitea-app -e GITEA__database__DB_TYPE=mysql -e GITEA__database__HOST=gitea-db:3306 -e GITEA__database__NAME=gitea -e GITEA__database__USER=gitea -e GITEA__database__PASSWD=gitea -v gitea-data-volume:/var/lib/gitea:Z -v gitea-config-volume:/etc/gitea:Z docker.io/gitea/gitea:latest-rootless`

`GITEA__database__HOST` должно соответствовать названию созданного MySQL контейнера, а `GITEA__database__PASSWD` должен быть заменен на ранее заданный пароль MySQL. Названные тома создаются по аналогии; не забыть `:Z` для SELinux.

Проброс портов в строку **не добавляем**, так как это задается в `pod`.

Проверим работу контейнера:


```
[user@localhost ~]$ podman ps --pod
CONTAINER ID  IMAGE                                    COMMAND     CREATED         STATUS             PORTS                                         NAMES               POD ID        PODNAME
62511c70363d  localhost/podman-pause:4.3.1-1668180253              3 minutes ago   Up 2 minutes ago   0.0.0.0:2222->22/tcp, 0.0.0.0:3000->3000/tcp  d38b33e5e047-infra  d38b33e5e047  gitea
57478a1ad761  docker.io/library/mysql:8                mysqld      2 minutes ago   Up 2 minutes ago   0.0.0.0:2222->22/tcp, 0.0.0.0:3000->3000/tcp  gitea-db            d38b33e5e047  gitea
54eb4d9d4857  docker.io/gitea/gitea:latest-rootless                20 seconds ago  Up 20 seconds ago  0.0.0.0:2222->22/tcp, 0.0.0.0:3000->3000/tcp  gitea-app           d38b33e5e047  gitea
```
Теперь внутри `gitea`есть три контейнера: инфраструктурный контейнер, `gitea-db`и `gitea-app`:


```
[user@localhost ~]$ podman pod list
POD ID        NAME        STATUS      CREATED        INFRA ID      # OF CONTAINERS
d38b33e5e047  gitea       Running     5 minutes ago  62511c70363d  3
```
Gitea успешно запустился и доступен по ссылке http://localhost:3000.

![](https://habrastorage.org/r/w1560/getpro/habr/upload_files/721/d53/b0c/721d53b0c05e9c48bf86a7fa765ef76e.png)

### Автозапуск с systemd

`podman` тесно интегрируется с `systemd`. Готовая конфигурация контейнеров экспортируется в виде `systemd`сервисов:


```
[user@localhost ~]$ podman generate systemd --new --files --name gitea
/home/user/pod-gitea.service
/home/user/container-gitea-app.service
/home/user/container-gitea-db.service
```
Рассмотрим файлы поближе:


```
[user@localhost ~]$ cat /home/user/pod-gitea.service
# pod-gitea.service
# autogenerated by Podman 4.3.1
# Thu Dec  8 17:56:33 MSK 2022

[Unit]
Description=Podman pod-gitea.service
Documentation=man:podman-generate-systemd(1)
Wants=network-online.target
After=network-online.target
RequiresMountsFor=/run/user/1000/containers
Wants=container-gitea-app.service container-gitea-db.service
Before=container-gitea-app.service container-gitea-db.service

[Service]
Environment=PODMAN_SYSTEMD_UNIT=%n
Restart=on-failure
TimeoutStopSec=70
ExecStartPre=/bin/rm \
        -f %t/pod-gitea.pid %t/pod-gitea.pod-id
ExecStartPre=/usr/bin/podman pod create \
        --infra-conmon-pidfile %t/pod-gitea.pid \
        --pod-id-file %t/pod-gitea.pod-id \
        --exit-policy=stop \
        --name gitea \
        -p 3000:3000 \
        -p 2222:22 \
        --replace
ExecStart=/usr/bin/podman pod start \
        --pod-id-file %t/pod-gitea.pod-id
ExecStop=/usr/bin/podman pod stop \
        --ignore \
        --pod-id-file %t/pod-gitea.pod-id  \
        -t 10
ExecStopPost=/usr/bin/podman pod rm \
        --ignore \
        -f \
        --pod-id-file %t/pod-gitea.pod-id
PIDFile=%t/pod-gitea.pid
Type=forking

[Install]
WantedBy=default.target
```
Сервис `pod-gitea.service` задает сервисы `container-gitea-app.service container-gitea-db.service` как необходимые для запуска перед инициализацией `gitea`:


```
Wants=container-gitea-app.service container-gitea-db.service
Before=container-gitea-app.service container-gitea-db.service
```
Помещаем файлы сервисов в пользовательскую папку сервисов `systemd`:


```
$ mv *.service .config/systemd/user/
```
Запускаем сервисы и добавляем в автозапуск:


```
$ systemctl --user daemon-reload
$ systemctl --user enable --now pod-gitea.service
```
Gitea полностью настроен с Podman!

### Больше о Podman

Red Hat предоставляет множество различной документации и блогпостов для ознакомления с Podman. Хорошее начало - по этой ссылке: [https://developers.redhat.com/articles/2022/05/02/podman-basics-resources-beginners-and-experts](https://developers.redhat.com/articles/2022/05/02/podman-basics-resources-beginners-and-experts#more_podman_resources).

    