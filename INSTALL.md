# 🚀 Instalação rápida

Frontend da **Calculadora RTC** (IBS · CBS · IS) com análise de NFS-e.

Requisito: **Docker + Docker Compose** (recomendado) **ou** **Node.js 20+**.

> ⚙️ **Sobre o backend:** este app é apenas a interface. Para calcular tributos ele consome a API oficial
> [ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)
> (Spring Boot, porta 8080). Sem o backend, a tela abre mas os cálculos não retornam resultado.

---

## 1. Com Docker (recomendado)

```bash
git clone https://github.com/dreduardocruz/calculadora-rtc-frontend.git
cd calculadora-rtc-frontend
cp .env.example .env        # ajuste o API_TARGET se a API não estiver em localhost:8080
docker compose up -d --build
```

Acesse **http://localhost:3000**

Para acompanhar os logs ou parar:

```bash
docker compose logs -f
docker compose down
```

### Alternativa sem Compose

```bash
docker build -t calculadora-rtc-frontend .
docker run -d --name calculadora-rtc-frontend -p 3000:80 \
  --add-host=host.docker.internal:host-gateway \
  -e API_TARGET=http://host.docker.internal:8080 \
  calculadora-rtc-frontend
```

> O `--add-host` é necessário no Linux quando a API roda na própria máquina.

---

## 2. Sem Docker (Node.js)

```bash
git clone https://github.com/dreduardocruz/calculadora-rtc-frontend.git
cd calculadora-rtc-frontend
npm install
npm run dev
```

Acesse **http://localhost:3000** (o Vite faz proxy de `/api` para `http://localhost:8080`).

---

## ⚙️ Configuração (`.env`)

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `API_TARGET` | Endereço base do backend (proxiado em `/api`) | `http://host.docker.internal:8080` |
| `FRONTEND_PORT` | Porta publicada no host | `3000` |

---

## 🧰 Problemas comuns

| Sintoma | Solução |
| --- | --- |
| Porta 3000 já está em uso | `FRONTEND_PORT=3001 docker compose up -d` |
| `/api` retorna 502 / erro de conexão | Ajuste `API_TARGET`; em `docker run` puro no Linux adicione `--add-host=host.docker.internal:host-gateway` |
| Container não sobe (`host not found in upstream`) | O host de `API_TARGET` não foi resolvido — confira o endereço e o `--add-host` |
| PDF não é lido | Apenas o layout **DANFSe v2.0** é suportado no momento |
