const I18N = {
  lang: localStorage.getItem('swiss-lang') || 'ru',
  dict: {
    ru: {
      nav_home:'Главная', nav_apply:'Анкета', nav_contacts:'Контакты', nav_admin:'Админ',
      nav_fleet:'Флот', nav_routes:'Маршруты', nav_map:'Карта', nav_events:'События', nav_history:'История', nav_patent:'Патент',
      hero_badge:'Виртуальная авиакомпания PTFS',
      hero_title:'Swiss <span class="red">Airlines</span> VA',
      hero_desc:'Швейцарское качество, точность и надёжность в каждом виртуальном рейсе. Присоединяйся к элите европейских пилотов.',
      btn_apply:'Подать заявку', btn_contacts:'Связаться', btn_fleet:'Изучить флот', btn_routes:'Все маршруты',
      features_title:'Почему Swiss VA?', features_desc:'Мы создаём атмосферу реальной авиакомпании с полным погружением в мир авиации.',
      feat_1_title:'Реальный флот', feat_1_desc:'Летай на точных копиях A220, A320, A330, B777 с реальными характеристиками и маршрутами Swiss International Air Lines.',
      feat_2_title:'30+ направлений', feat_2_desc:'Европа, Азия, Америка и Ближний Восток. От коротких перелётов до 12-часовых трансатлантических рейсов.',
      feat_3_title:'Discord-сообщество', feat_3_desc:'Активное комьюнити пилотов и диспетчеров. Совместные полёты, ивенты и турниры.',
      feat_4_title:'Статус и репутация', feat_4_desc:'Swiss Airlines VA — узнаваемый бренд в сообществе PTFS. Стань частью истории.',
      stats_title:'Цифры говорят сами за себя',
      stat_1:'Пилотов', stat_2:'Заявок', stat_3:'Лет на рынке', stat_4:'Довольных',
      apply_title:'Анкета пилота', apply_desc:'Заполни форму ниже, чтобы подать заявку на вступление в Swiss Airlines VA.',
      label_name:'Имя', label_age:'Возраст', label_platform:'Платформа', label_username:'Никнейм в игре',
      label_discord:'Discord', label_country:'Страна', label_exp:'Опыт полётов', label_hours:'Часы в PTFS',
      label_motivation:'Почему именно Swiss VA?', btn_send:'Отправить заявку',
      contacts_title:'Связь с нами', contacts_desc:'Есть вопросы? Хочешь узнать больше? Свяжись любым удобным способом.',
      contact_discord_title:'Discord-сервер', contact_discord_desc:'Основная площадка для общения, объявлений и координации полётов.',
      contact_discord_btn:'Присоединиться',
      contact_email_title:'Электронная почта', contact_email_desc:'Для официальных вопросов, жалоб и предложений.',
      contact_admin_title:'Администратор', contact_admin_desc:'Личный контакт основателя VA.',
      login_title:'Вход в админ-панель', login_subtitle:'Только для администрации Swiss Airlines VA',
      label_login:'Логин', label_pass:'Пароль', btn_login:'Войти',
      fleet_title:'Флот Swiss Airlines', fleet_desc:'Реальные самолёты, реальные характеристики. От A220 до B777-300ER.',
      fleet_model:'Модель', fleet_category:'Класс', fleet_capacity:'Пассажиры', fleet_range:'Дальность', fleet_speed:'Скорость', fleet_status:'Статус',
      routes_title:'Маршруты', routes_desc:'33 направления из Цюриха и Женевы. Открой мир вместе с Swiss.',
      route_origin:'Вылет', route_destination:'Прилёт', route_dist:'Расстояние', route_time:'Время', route_aircraft:'Самолёт', route_freq:'Частота',
      map_title:'Карта маршрутов', map_desc:'Интерактивная карта всех направлений Swiss Airlines VA.',
      events_title:'События', events_desc:'Групповые полёты, тренировки, турниры и особые рейсы.',
      event_date:'Дата', event_info:'Описание',
      history_title:'История Swiss VA', history_desc:'Ключевые вехи развития виртуальной авиакомпании.',
      patent_title:'Патент Swiss Airlines VA', patent_desc:'Официальная документация виртуальной авиакомпании в PTFS.',
      patent_badge:'Официальная регистрация', patent_name:'Swiss Airlines VA',
      patent_text:'Данная виртуальная авиакомпания зарегистрирована и функционирует в рамках сообщества PTFS. Все права на бренд, маршруты и материалы принадлежат администрации Swiss Airlines VA.',
      patent_founder:'Основатель', patent_date:'Дата создания', patent_game:'Игра', patent_discord:'Discord',
      rules_title:'Правила сообщества',
      rule_1_title:'Уважение', rule_1_desc:'Уважай пилотов, диспетчеров и администрацию. Токсичность и оскорбления запрещены.',
      rule_2_title:'Реализм', rule_2_desc:'Соблюдай реалистичные процедуры полёта, используй правильные позывные и маршруты.',
      rule_3_title:'Активность', rule_3_desc:'Выполняй минимум 1 рейс в месяц. При неактивности более 60 дней — исключение.',
      rule_4_title:'Discord', rule_4_desc:'Обязательное присутствие в Discord сервере для получения расписания и объявлений.',
      rule_5_title:'Нарушения', rule_5_desc:'За нарушение правил — предупреждение, затем понижение или исключение из VA.',
      admin_title:'Админ-панель', admin_export:'Экспорт CSV', admin_logout:'Выйти',
      footer:'© 2026 Swiss Airlines VA. Все права защищены. PTFS.'
    },
    en: {
      nav_home:'Home', nav_apply:'Apply', nav_contacts:'Contacts', nav_admin:'Admin',
      nav_fleet:'Fleet', nav_routes:'Routes', nav_map:'Map', nav_events:'Events', nav_history:'History', nav_patent:'Patent',
      hero_badge:'Virtual Airline for PTFS',
      hero_title:'Swiss <span class="red">Airlines</span> VA',
      hero_desc:'Swiss quality, precision and reliability in every virtual flight. Join the elite of European pilots.',
      btn_apply:'Apply Now', btn_contacts:'Get in Touch', btn_fleet:'Explore Fleet', btn_routes:'All Routes',
      features_title:'Why Swiss VA?', features_desc:'We create the atmosphere of a real airline with full immersion into aviation.',
      feat_1_title:'Real Fleet', feat_1_desc:'Fly accurate replicas of A220, A320, A330, B777 with real specs and Swiss International Air Lines routes.',
      feat_2_title:'30+ Destinations', feat_2_desc:'Europe, Asia, Americas and Middle East. From short hops to 12-hour transatlantic flights.',
      feat_3_title:'Discord Community', feat_3_desc:'Active community of pilots and controllers. Group flights, events and tournaments.',
      feat_4_title:'Status & Reputation', feat_4_desc:'Swiss Airlines VA is a recognized brand in the PTFS community. Become part of the story.',
      stats_title:'The Numbers Speak for Themselves',
      stat_1:'Pilots', stat_2:'Applications', stat_3:'Years', stat_4:'Satisfied',
      apply_title:'Pilot Application', apply_desc:'Fill out the form below to apply for Swiss Airlines VA.',
      label_name:'Name', label_age:'Age', label_platform:'Platform', label_username:'In-game Username',
      label_discord:'Discord', label_country:'Country', label_exp:'Flight Experience', label_hours:'Hours in PTFS',
      label_motivation:'Why Swiss VA?', btn_send:'Submit Application',
      contacts_title:'Contact Us', contacts_desc:'Have questions? Want to know more? Reach out any way you prefer.',
      contact_discord_title:'Discord Server', contact_discord_desc:'Main platform for communication, announcements and flight coordination.',
      contact_discord_btn:'Join Server',
      contact_email_title:'Email', contact_email_desc:'For official inquiries, complaints and suggestions.',
      contact_admin_title:'Administrator', contact_admin_desc:'Personal contact of the VA founder.',
      login_title:'Admin Login', login_subtitle:'Swiss Airlines VA administration only',
      label_login:'Username', label_pass:'Password', btn_login:'Sign In',
      fleet_title:'Swiss Airlines Fleet', fleet_desc:'Real aircraft, real specs. From A220 to B777-300ER.',
      fleet_model:'Model', fleet_category:'Class', fleet_capacity:'Passengers', fleet_range:'Range', fleet_speed:'Speed', fleet_status:'Status',
      routes_title:'Routes', routes_desc:'33 destinations from Zurich and Geneva. Explore the world with Swiss.',
      route_origin:'Departure', route_destination:'Arrival', route_dist:'Distance', route_time:'Time', route_aircraft:'Aircraft', route_freq:'Frequency',
      map_title:'Route Map', map_desc:'Interactive map of all Swiss Airlines VA destinations.',
      events_title:'Events', events_desc:'Group flights, training, tournaments and special flights.',
      event_date:'Date', event_info:'Description',
      history_title:'Swiss VA History', history_desc:'Key milestones of the virtual airline development.',
      patent_title:'Swiss Airlines VA Patent', patent_desc:'Official documentation of the virtual airline in PTFS.',
      patent_badge:'Official Registration', patent_name:'Swiss Airlines VA',
      patent_text:'This virtual airline is registered and operates within the PTFS community. All rights to the brand, routes and materials belong to the Swiss Airlines VA administration.',
      patent_founder:'Founder', patent_date:'Founded', patent_game:'Game', patent_discord:'Discord',
      rules_title:'Community Rules',
      rule_1_title:'Respect', rule_1_desc:'Respect pilots, controllers and admins. Toxicity and insults are prohibited.',
      rule_2_title:'Realism', rule_2_desc:'Follow realistic flight procedures, use correct callsigns and routes.',
      rule_3_title:'Activity', rule_3_desc:'Complete at least 1 flight per month. Inactivity over 60 days leads to removal.',
      rule_4_title:'Discord', rule_4_desc:'Mandatory presence on the Discord server for schedules and announcements.',
      rule_5_title:'Violations', rule_5_desc:'Violations result in a warning, then demotion or removal from the VA.',
      admin_title:'Admin Panel', admin_export:'Export CSV', admin_logout:'Logout',
      footer:'© 2026 Swiss Airlines VA. All rights reserved. PTFS.'
    }
  },
  toggle() {
    this.lang = this.lang === 'ru' ? 'en' : 'ru';
    localStorage.setItem('swiss-lang', this.lang);
    document.documentElement.lang = this.lang;
    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = this.lang === 'ru' ? 'EN' : 'RU';
    this.apply();
  },
  apply() {
    const d = this.dict[this.lang] || this.dict.ru;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (d[key]) el.innerHTML = d[key];
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  I18N.apply();
  const btn = document.getElementById('langToggle');
  if (btn) {
    btn.textContent = I18N.lang === 'ru' ? 'EN' : 'RU';
    btn.addEventListener('click', () => I18N.toggle());
  }
});
