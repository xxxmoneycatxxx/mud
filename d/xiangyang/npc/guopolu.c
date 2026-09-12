// guopolu.c 郭破虏

inherit NPC;

void create()
{
    set_name("郭破虏", ({"guo polu", "guo", "polu"}));
    set("title", "郭靖黄蓉之子");
    set("gender", "男性");
    set("age", 16);
    set("startroom", "/d/wuguan/guofu_dayuan2");
    set("long",
        "他是郭靖黄蓉的幼子，郭芙和郭襄的双生弟弟。\n"
        "性格沉默寡言，忠厚老实，颇有乃父之风。平时在\n"
        "府中跟随耶律齐习武，立志将来也要守卫襄阳。\n"
    );

    set("attitude", "peaceful");

    set("per", 18);
    set("str", 22);
    set("int", 16);
    set("con", 24);
    set("dex", 18);

    set("qi", 800);
    set("max_qi", 800);
    set("jing", 300);
    set("max_jing", 300);
    set("neili", 400);
    set("max_neili", 400);
    set("jiali", 0);

    set("combat_exp", 30000);
    set("score", 0);

    set_skill("force", 50);
    set_skill("huntian-qigong", 50);
    set_skill("strike", 50);
    set_skill("dragon-strike", 40);
    set_skill("dodge", 40);
    set_skill("jinyan-gong", 40);
    set_skill("parry", 50);
    set_skill("sword", 30);

    map_skill("force", "huntian-qigong");
    map_skill("strike", "dragon-strike");
    map_skill("dodge", "jinyan-gong");

    prepare_skill("strike", "dragon-strike");

    setup();
    carry_object("/clone/misc/cloth")->wear();
    carry_object("/clone/weapon/changjian")->wield();
}
