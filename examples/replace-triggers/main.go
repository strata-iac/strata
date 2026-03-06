package main

import (
	"github.com/pulumi/pulumi-command/sdk/go/command/local"
	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

// Exercises: resource replacement flow, create→delete lifecycle hooks,
// stdout/stderr storage in state, triggers causing re-creation,
// DeleteBeforeReplace semantics, command execution outputs.

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Trigger value — changing this forces replacement of dependent commands.
		trigger, err := random.NewRandomUuid(ctx, "trigger", &random.RandomUuidArgs{})
		if err != nil {
			return err
		}

		// Command with create + delete hooks.
		// Tests: command execution, stdout/stderr in checkpoint, lifecycle hooks.
		setup, err := local.NewCommand(ctx, "setup", &local.CommandArgs{
			Create: pulumi.String("echo 'resource created' && date -u +%s"),
			Delete: pulumi.String("echo 'resource deleted'"),
			Environment: pulumi.StringMap{
				"STRATA_TEST": pulumi.String("true"),
			},
		})
		if err != nil {
			return err
		}

		// Command triggered by random UUID — every `pulumi up` after
		// the trigger changes will replace this resource.
		timestamped, err := local.NewCommand(ctx, "timestamped", &local.CommandArgs{
			Create:   pulumi.String("echo $(date -u +%Y-%m-%dT%H:%M:%SZ)"),
			Delete:   pulumi.String("echo 'cleaning up timestamped'"),
			Triggers: pulumi.Array{trigger.Result},
		})
		if err != nil {
			return err
		}

		// Command with DeleteBeforeReplace.
		// Tests: engine must delete old resource BEFORE creating replacement.
		_, err = local.NewCommand(ctx, "delete-first", &local.CommandArgs{
			Create:   pulumi.String("echo 'created with delete-before-replace'"),
			Delete:   pulumi.String("echo 'deleted (before replace)'"),
			Triggers: pulumi.Array{trigger.Result},
		}, pulumi.DeleteBeforeReplace(true))
		if err != nil {
			return err
		}

		// Chain: command that reads output of another command.
		// Tests: Apply/interpolation in state, property deps.
		_, err = local.NewCommand(ctx, "consumer", &local.CommandArgs{
			Create: pulumi.Sprintf("echo 'setup said: %s'", setup.Stdout),
		})
		if err != nil {
			return err
		}

		ctx.Export("setupStdout", setup.Stdout)
		ctx.Export("timestamp", timestamped.Stdout)

		return nil
	})
}
