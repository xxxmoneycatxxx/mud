//
inherit ITEM;
void init()
{
    add_action("do_eat", "eat");
}

void create()
{
    set_name("蛇胆膏", ({"shedan gao", "gao"}));
    if (clonep())
        set_default_object(__FILE__);
    else {
        set("unit", "块");
        set("long", "这是珍贵补品『蛇胆膏』。\n");
        set("value", 1000);
    }
    setup();
}

int do_eat(string arg)
{
    object me = this_player();
    if (!id(arg))
        return notify_fail("你要吃什么？\n");
    if((me->query("max_jing")>=200)||(me->query("max_qi")>=200))
        return notify_fail("你吃『蛇胆膏』已无效用！\n");
    if(me->query("max_jing")<180)
    {
        // 改为增加内力/精力上限，由 setup_char 重算气血/精气，确保持久化
        me->add("max_neili", 40);
        me->add("max_jingli", 40);
    }
    else
    {
        me->add("max_neili", 8);
        me->add("max_jingli", 8);
    }
    // 重新计算派生属性（max_qi 依赖 max_neili，max_jing 依赖 max_jingli）
    CHAR_D->setup_char(me);
    me->set("qi", me->query("max_qi"));
    me->set("jing", me->query("max_jing"));
    message_vision( "$N吃下一块蛇胆膏，顿觉一股浩荡真气直涌上来，
精，气大增...\n" , me);
    destruct(this_object());
    return 1;
}
