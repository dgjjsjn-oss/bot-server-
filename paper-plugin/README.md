# FakePlayers Paper Plugin

Fakes player count in the server browser and pings your Render website every 5 minutes to keep things alive.
No bot, no Minecraft account, no open ports, no commands, negligible CPU/RAM.

## What it does
- When someone pings your server (server browser, Discord, etc.), it reports a fake online player count (e.g. 3/20) and fake MOTD.
- Every 30 seconds it pings `https://bot-server-24lv.onrender.com/ping` to keep Render awake.
- When no real players are online, it broadcasts a fake keepalive chat message so the server isn't totally silent.

## What it does NOT do
- It does NOT create real TCP connections. If Falix's dashboard shuts down servers based on actual connected players (not just the server list), this plugin alone will not stop that.
- It does NOT open any backdoor or listener. Safe to use.

## Install
1. Install JDK 17+ and Gradle on your PC.
2. In the `paper-plugin` folder run: `gradle build`
3. Grab `paper-plugin/build/libs/FakePlayers-1.0.0.jar`
4. Drop it into your Paper server's `plugins/` folder and restart.
5. Edit `plugins/FakePlayers/config.yml` if you want to change fake names or the website URL.

## Config
```yaml
fake-player-names:
  - wembo
  - Player1
  - Guest
fake-online-count: 3
fake-max-players: 20
website-url: "https://bot-server-24lv.onrender.com/ping"
ping-interval-seconds: 300
```
