// guoxiang.c 郭襄

inherit NPC;

void create()
{
    set_name("郭襄", ({"guo xiang", "guo", "xiang"}));
    set("title", "郭靖黄蓉之次女");
    set("gender", "女性");
    set("age", 16);
    set("startroom", "/d/wuguan/guofu_huayuan");
    set("long",
        "她是郭靖黄蓉的次女，郭芙的妹妹。与姐姐不同，\n"
        "她豪爽洒脱，不拘小节，颇有乃祖东邪之风。虽然\n"
        "年纪不大，却已隐隐有独立闯荡江湖的气概。\n"
    );

    set("attitude", "peaceful");

    set("per", 26);
    set("str", 16);
    set("int", 32);
    set("con", 18);
    set("dex", 24);

    set("qi", 600);
    set("max_qi", 600);
    set("jing", 400);
    set("max_jing", 400);
    set("neili", 300);
    set("max_neili", 300);
    set("jiali", 0);

    set("combat_exp", 20000);
    set("score", 0);

    set_skill("force", 40);
    set_skill("bibo-shengong", 40);
    set_skill("strike", 40);
    set_skill("luoying-shenzhang", 40);
    set_skill("dodge", 50);
    set_skill("anying-fuxiang", 40);
    set_skill("parry", 40);
    set_skill("sword", 30);
    set_skill("luoying-shenjian", 30);
    set_skill("qimen-wuxing", 40);
    set_skill("literate", 50);

    map_skill("force", "bibo-shengong");
    map_skill("strike", "luoying-shenzhang");
    map_skill("dodge", "anying-fuxiang");
    map_skill("sword", "luoying-shenjian");

    prepare_skill("strike", "luoying-shenzhang");

    setup();
    carry_object("/d/taohua/obj/ruanwei")->wear();
    carry_object("/d/taohua/obj/shudai")->wear();
}
