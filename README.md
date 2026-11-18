# Calculadora RTC — Frontend (Análise NFS-e)

[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](./LICENSE)
[![Docker](https://img.shields.io/badge/Docker-pronto-2496ED.svg?logo=docker&logoColor=white)](./Dockerfile)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=white)](https://react.dev)
[![Vite 6](https://img.shields.io/badge/Vite-6-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![Backend: Receita Federal](https://img.shields.io/badge/backend-Receita%20Federal-1351B4.svg)](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)

Interface web para a **Calculadora do Regime Regular (IBS · CBS · IS)** da Receita Federal, com um módulo adicional de **importação e análise de NFS-e**.

> ⚙️ **Requer o backend** [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular) (API Spring Boot) em execução.
> 🚀 **Instalação rápida para enviar aos amigos:** [INSTALL.md](./INSTALL.md).

Permite calcular os tributos da reforma tributária a partir de notas de serviço, fazer uma **análise exploratória (EDA)** dos tributos das notas pretéritas e **projetar** a carga futura com base na média, mediana e tendência dos meses.

---

## ✨ Funcionalidades

### Aba **Calculadora**
- Cálculo do **Regime Regular (IBS · CBS · IS)** consumindo a API oficial.
- Múltiplos itens por nota, com **NBS**, **CST / cClassTrib**, base de cálculo e unidade.
- Classificação tributária automática por NBS e data.
- Cenário **Pós-2027** com **alíquotas nominais editáveis** (a base offline não possui tabela de referência para 2027+).
- Memória de cálculo e detalhamento por tributo.

### Aba **Análise NFS-e**
- **Importação** de notas de serviço por *drag & drop* ou seleção múltipla:
  - **XML** nos leiautes **ABRASF 2.04** e **SPED/DPS 1.00**
  - **PDF** no padrão **DANFSe v2.0** (extração local via PDF.js — nada sai do navegador)
- **Classificação automática** de CST / cClassTrib por NBS e competência.
- **EDA com gráficos** (SVG puro, sem bibliotecas externas):
  - Faturamento e tributos por mês
  - Comparativo ISS das notas × RTC do regime regular
  - Composição dos tributos e distribuição da alíquota efetiva por nota
- **Previsão** da carga RTC para os próximos 6 meses (média, mediana e regressão linear).
- **Exportação** das notas e tributos apurados em **CSV** e **JSON**.
- Botão **“usar”** para preencher a calculadora com os dados de uma nota analisada.

---

## 🧱 Stack

| Camada | Tecnologia |
| --- | --- |
| UI | React 18 + TypeScript |
| Build | Vite 6 |
| Estilos | Tailwind CSS v4 |
| PDF | PDF.js (`pdfjs-dist`) |
| Gráficos | SVG próprio |
| Servidor (produção) | nginx (imagem Docker) |

---

## 📋 Pré-requisitos

- **Docker + Docker Compose** (instalação recomendada), **ou**
- **Node.js 20+** e **npm** (desenvolvimento local)
- A **API da Calculadora RTC** (backend Spring Boot) em execução e acessível

> A API é um projeto separado e open-source: [ReceitaFederal/calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular).
> Este frontend apenas consome essa API — nenhuma regra fiscal é reimplementada aqui.

---

## 🐳 Instalação com Docker (recomendada)

### 1. Clonar o repositório

```bash
git clone https://github.com/dreduardocruz/calculadora-rtc-frontend.git
cd calculadora-rtc-frontend
```

### 2. Configurar o endereço da API

```bash
cp .env.example .env
```

Edite o `.env` e aponte `API_TARGET` para a sua API:

```env
API_TARGET=http://host.docker.internal:8080
FRONTEND_PORT=3000
```

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `API_TARGET` | Endereço base do backend (proxiado em `/api` pelo nginx) | `http://host.docker.internal:8080` |
| `FRONTEND_PORT` | Porta publicada no host | `3000` |

### 3. Subir o container

```bash
docker compose up -d --build
```

Acesse: **http://localhost:3000**

Para acompanhar os logs ou parar:

```bash
docker compose logs -f
docker compose down
```

### Alternativa — Docker puro (sem Compose)

```bash
docker build -t calculadora-rtc-frontend .

docker run -d --name calculadora-rtc-frontend \
  -p 3000:80 \
  -e API_TARGET=http://SEU_HOST:8080 \
  calculadora-rtc-frontend
```

> Em Linux, se a API estiver na máquina host, adicione `--add-host=host.docker.internal:host-gateway`
> ao `docker run` (o Compose já faz isso automaticamente).

---

## 💻 Desenvolvimento local

```bash
npm install
npm run dev
```

A aplicação sobe em **http://localhost:3000** e o Vite faz proxy de `/api` para
`http://localhost:8080` (configurado em [`vite.config.ts`](./vite.config.ts)).

Scripts disponíveis:

```bash
npm run dev       # servidor de desenvolvimento (host 0.0.0.0, porta 3000)
npm run build     # build de produção em dist/
npm run preview   # pré-visualiza o build de produção
```

---

## 🔌 API consumida

| Método | Endpoint | Uso |
| --- | --- | --- |
| `POST` | `/api/calculadora/regime-geral` | Cálculo dos tributos (IBS · CBS · IS) |
| `GET` | `/api/calculadora/nfse/situacoes-classificacoes-tributarias?nbs=&data=` | Classificação CST / cClassTrib por NBS e data |
| `GET` | `/api/calculadora/dados-abertos/nbs/lista?data=` | Lista de NBS disponíveis |

O nginx (produção) e o proxy do Vite (desenvolvimento) encaminham tudo que começa com `/api` para o backend configurado.

---

## 📄 Formatos de NFS-e suportados

| Formato | Tipo | Observação |
| --- | --- | --- |
| ABRASF 2.04 | XML | Tag `<InfNfse>` |
| SPED/DPS 1.00 | XML | Tag `<infNFSe>` |
| DANFSe v2.0 | PDF | Extração de texto local via PDF.js |

> Para PDF, é necessário que o documento seja o **DANFSe v2.0 nacional** (mesmo layout do XML SPED/DPS).
> Arquivos que não seguem esse layout são listados como aviso e ignorados, sem interromper a análise das demais notas.

---

## 🚀 Como usar

1. Abra a aba **Análise NFS-e**.
2. Arraste seus arquivos (XML e/ou PDF) para a área de importação.
3. Ajuste os **parâmetros de cálculo**, se necessário:
   - **NBS**: usar o da própria nota ou selecionar outro.
   - **Classificação CST / cClassTrib**: automática (API) ou manual.
   - **Cenário pós-2027**: alíquotas nominais (CBS / IBS-UF / IBS-Mun).
4. Analise os **gráficos de EDA** e a **previsão** dos próximos 6 meses.
5. Use **CSV / JSON** para exportar, ou o botão **“usar”** de uma nota para preencher a aba **Calculadora**.

---

## 📁 Estrutura do projeto

```
frontend/
├── public/                  # arquivos estáticos (favicon)
├── src/
│   ├── App.tsx              # layout, abas e integração com a calculadora
│   ├── NfseAnalyzer.tsx     # aba de importação/análise de NFS-e
│   ├── nfse.ts              # parsing de XML/PDF + cliente da API
│   ├── pdf-text.ts          # extração de texto de PDF (PDF.js)
│   ├── nfse-eda.ts          # estatística descritiva e previsão
│   ├── Charts.tsx           # gráficos em SVG
│   ├── ItemCard.tsx         # cartão de item da calculadora
│   ├── lib.ts               # utilitários (formatação, datas, payload)
│   └── ui.tsx               # componentes de UI
├── nginx/default.conf.template
├── Dockerfile
├── docker-compose.yml
└── vite.config.ts
```

---

## 📜 Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](./LICENSE).

A API consumida é um projeto open-source da Receita Federal do Brasil
([calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular), licença MIT).
