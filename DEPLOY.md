# Interativa — Guia de Instalação no Servidor

## Pré-requisitos

- Servidor Linux com Docker + Portainer instalados
- Traefik rodando com a rede `network_public` criada
- Resolver Let's Encrypt configurado como `letsencryptresolver` no Traefik
- PostgreSQL já rodando no servidor (mesmo que outras aplicações usam)
- Registro DNS apontando o subdomínio para o IP do servidor

---

## 1. Criar o registro DNS

No painel do seu domínio, crie um registro do tipo **A**:

```
Tipo:  A
Nome:  interativa          (resulta em interativa.adrofecha.com.br)
Valor: IP_DO_SEU_SERVIDOR
TTL:   3600
```

---

## 2. Criar o banco de dados no PostgreSQL

Conecte ao PostgreSQL do servidor e crie o banco para a aplicação:

```bash
# Acessar o container postgres (ajuste o nome do container se necessário)
docker exec -it postgres psql -U postgres

# Dentro do psql:
CREATE DATABASE interativa;
\q
```

As tabelas são criadas automaticamente pelo sistema na primeira inicialização (migrations automáticas).

---

## 3. Verificar a rede network_public

```bash
docker network ls | grep network_public
```

Se não aparecer:

```bash
docker network create network_public
```

---

## 4. Criar o volume de uploads

Apenas as mídias (imagens e vídeos) precisam de volume. O banco fica no PostgreSQL.

```bash
docker volume create interativa_uploads
```

---

## 5. Instalar pelo Portainer

### 5.1 Acessar a criação de Stack

**Portainer → Stacks → Add Stack**

---

### 5.2 Preencher os campos

| Campo | Valor |
|---|---|
| **Name** | `interativa` |
| **Build method** | `Repository` |
| **Repository URL** | `https://github.com/ramonrduarte/interativo.git` |
| **Repository reference** | `refs/heads/main` |
| **Compose path** | `docker-compose.yml` |
| **Authentication** | Desligado (repositório público) |

---

### 5.3 Variáveis de ambiente

Role até **Environment variables** e adicione:

| Variable | Value | Descrição |
|---|---|---|
| `DOMAIN` | `interativa.adrofecha.com.br` | Subdomínio para acesso externo |
| `PORT` | `3001` | Porta exposta no host |
| `NODE_ENV` | `production` | Modo produção |
| `DATABASE_URL` | `postgresql://postgres:SUA_SENHA@postgres:5432/interativa` | Conexão PostgreSQL |

> **Atenção no DATABASE_URL:**
> - Se o PostgreSQL roda em outro container Docker, use o **nome do container** como host (ex: `postgres`)
> - Se o PostgreSQL roda no host diretamente, use o IP interno (ex: `192.168.0.110`)
> - Troque `SUA_SENHA` pela senha real do PostgreSQL

---

### 5.4 Fazer o deploy

Clique em **Deploy the stack**.

O Portainer vai:
1. Clonar o repositório do GitHub
2. Fazer o build da imagem (Node.js, instala dependências, compila o frontend)
3. Subir o container — na primeira inicialização, as tabelas são criadas automaticamente no PostgreSQL

O build leva aproximadamente **2 a 5 minutos** na primeira vez.

---

## 6. Verificar se subiu corretamente

```bash
# Ver se o container está rodando
docker ps | grep interativa

# Ver os logs em tempo real
docker logs -f interativa

# Deve aparecer:
# [db] PostgreSQL — migrações aplicadas
# [scheduler] Iniciado — verificando agendamentos a cada 30s
# 🚀 Interativa Server  → http://localhost:3001
```

Acesse no navegador:

**Via rede interna (uso diário):**
```
http://192.168.0.110:3001        → Dashboard de administração
http://192.168.0.110:3001/tv/    → App da TV (abrir no browser da TV)
```

**Via domínio externo (Traefik + SSL):**
```
https://interativa.adrofecha.com.br        → Dashboard
https://interativa.adrofecha.com.br/tv/    → App da TV
```

> Troque `192.168.0.110` pelo IP do seu servidor: `ip a | grep 192`

---

## 7. Parear uma TV

1. No browser da TV, acesse `http://IP_DO_SERVIDOR:3001/tv/` (rede interna)
2. Será exibido um código de 6 letras na tela
3. No Dashboard, vá em **Telas → Parear TV**
4. Selecione a tela e clique no código que aparecer

---

## 8. Atualizar o sistema

No Portainer → **Stacks → interativa → Editor** → clique em **Update the stack**.

O Portainer clona a versão mais recente do GitHub, reconstrói a imagem e aplica qualquer nova migration do banco automaticamente.

---

## 9. Backup dos uploads (imagens e vídeos)

O banco de dados é gerenciado pelo PostgreSQL (use o backup padrão do seu postgres).  
Para as mídias enviadas:

```bash
# Backup do volume de uploads
docker run --rm \
  -v interativa_uploads:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/interativa_uploads_$(date +%Y%m%d).tar.gz -C /data .

# Restaurar
docker run --rm \
  -v interativa_uploads:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/interativa_uploads_20250101.tar.gz -C /data
```

---

## Desenvolvimento local (sem PostgreSQL)

Para rodar na máquina local durante desenvolvimento, **não defina `DATABASE_URL`**. O sistema detecta automaticamente e usa SQLite (`data/interativa.db`):

```bash
npm install
npm run dev
```

Acesse em `http://localhost:5173` (dashboard) e `http://localhost:5174` (TV).

---

## Resumo de URLs

### Rede interna (uso diário)
| URL | Descrição |
|---|---|
| `http://192.168.0.110:3001` | Dashboard (administração) |
| `http://192.168.0.110:3001/tv/` | App da TV |
| `http://192.168.0.110:3001/api/health` | Status do servidor |

### Domínio externo
| URL | Descrição |
|---|---|
| `https://interativa.adrofecha.com.br` | Dashboard |
| `https://interativa.adrofecha.com.br/tv/` | App da TV |
