FROM node:18-alpine

WORKDIR /app

# Копируем зависимости
COPY package.json package-lock.json ./

# Устанавливаем зависимости (используем полный путь к npm)
RUN /usr/local/bin/npm install

# Копируем остальные файлы
COPY . .

# Запускаем приложение (используем shell-формат для CMD)
CMD npm run dev