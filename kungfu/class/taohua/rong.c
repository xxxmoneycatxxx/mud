#include <ansi.h>
#include "taohua.h"

inherit NPC;
inherit F_MASTER;

void create()
{
        set_name("黄蓉", ({"huang rong", "huang", "rong"}));
        set("title", "郭靖之妻");
        set("nickname", HIY "丐帮前任帮主" NOR);
        set("gender", "女性");
        set("age", 43);
        set("long", "她是郭靖的妻子，桃花岛主黄药师之女。\n"
                    "当年那个机灵古怪的少女如今已为人妻母，\n"
                    "眉宇间多了几分沉稳，目光中透着睿智从容。\n"
                    "襄阳守城的家事军务，大半由她操持打理。\n");
        set("attitude", "peaceful");
        set("class", "scholar");
        set("str", 28);
        set("int", 40);
        set("con", 30);
        set("dex", 30);
        set("qi", 4800);
        set("max_qi", 4800);
        set("jing", 3500);
        set("max_jing", 3500);
        set("neili", 5500);
        set("max_neili", 5500);
        set("jiali", 200);
        set("combat_exp", 3000000);

        set_skill("force", 240);
        set_skill("bibo-shengong", 240);
        set_skill("luoying-xinfa", 220);
        set_skill("hand", 240);
        set_skill("strike", 240);
        set_skill("pikong-zhang", 220);
        set_skill("luoying-shenzhang", 240);
        set_skill("dodge", 240);
        set_skill("anying-fuxiang", 240);
        set_skill("parry", 220);
        set_skill("sword", 220);
        set_skill("luoying-shenjian", 220);
        set_skill("yuxiao-jian", 220);
        set_skill("lanhua-shou", 240);
        set_skill("staff", 240);
        set_skill("dagou-bang", 240);
        set_skill("unarmed", 200);
        set_skill("xiaoyaoyou", 200);
        set_skill("throwing", 200);
        set_skill("mantianhuayu-zhen", 200);
        set_skill("qimen-wuxing", 280);
        set_skill("count", 280);
        set_skill("jingluo-xue", 260);
        set_skill("literate", 280);
        set_skill("mathematics", 280);
        set_skill("cooking", 280);
        set_skill("martial-cognize", 220);

        map_skill("force", "bibo-shengong");
        map_skill("hand", "lanhua-shou");
        map_skill("strike", "luoying-shenzhang");
        map_skill("dodge", "anying-fuxiang");
        map_skill("parry", "lanhua-shou");
        map_skill("staff", "dagou-bang");
        map_skill("sword", "yuxiao-jian");
        map_skill("unarmed", "xiaoyaoyou");
        map_skill("throwing", "mantianhuayu-zhen");

        prepare_skill("hand", "lanhua-shou");
        prepare_skill("strike", "luoying-shenzhang");

        create_family("桃花岛", 2, "爱女");

        set("chat_chance_combat", 120);
        set("chat_msg_combat", ({
                (: perform_action, "hand.fu" :),
                (: perform_action, "hand.fei" :),
                (: perform_action, "strike.zhuan" :),
                (: exert_function, "powerup" :),
                (: exert_function, "recover" :),
        }));
        set_temp("apply/damage", 100);
        set_temp("apply/unarmed_damage", 100);
        set_temp("apply/armor", 200);

        setup();
        carry_object("/d/taohua/obj/ruanwei")->wear();
        carry_object("/d/taohua/obj/shudai")->wear();
}

void attempt_apprentice(object ob)
{
        command("say 现在国难当头，我哪里有时间收徒啊。");
        return;
}

