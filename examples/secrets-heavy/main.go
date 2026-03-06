package main

import (
	"fmt"

	"github.com/pulumi/pulumi-random/sdk/v4/go/random"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"
)

// Tests: batch-decrypt endpoint (preview/refresh/destroy need this),
// secret serialization in checkpoint, encrypt/decrypt per-value,
// config secrets, secret stack outputs, RandomPassword/RandomBytes
// which produce inherently secret outputs.
func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		// Config secrets — stored encrypted, must be decrypted by backend.
		cfg := config.New(ctx, "")
		dbHost := cfg.Get("dbHost")
		if dbHost == "" {
			dbHost = "localhost"
		}
		// RandomPassword — Result and BcryptHash are secret outputs.
		adminPass, err := random.NewRandomPassword(ctx, "admin-pass", &random.RandomPasswordArgs{
			Length:          pulumi.Int(32),
			Special:         pulumi.Bool(true),
			OverrideSpecial: pulumi.String("!@#$%"),
		})
		if err != nil {
			return err
		}

		userPass, err := random.NewRandomPassword(ctx, "user-pass", &random.RandomPasswordArgs{
			Length:  pulumi.Int(16),
			Special: pulumi.Bool(false),
		})
		if err != nil {
			return err
		}

		// RandomBytes — Base64 and Hex are secret outputs.
		encKey, err := random.NewRandomBytes(ctx, "encryption-key", &random.RandomBytesArgs{
			Length: pulumi.Int(32),
		})
		if err != nil {
			return err
		}

		signingKey, err := random.NewRandomBytes(ctx, "signing-key", &random.RandomBytesArgs{
			Length: pulumi.Int(64),
		})
		if err != nil {
			return err
		}

		// Multiple API keys — all secret.
		apiKeys := make([]*random.RandomPassword, 5)
		for i := range 5 {
			apiKeys[i], err = random.NewRandomPassword(ctx, fmt.Sprintf("api-key-%d", i), &random.RandomPasswordArgs{
				Length:  pulumi.Int(48),
				Special: pulumi.Bool(false),
				Upper:   pulumi.Bool(true),
				Lower:   pulumi.Bool(true),
				Numeric: pulumi.Bool(true),
			})
			if err != nil {
				return err
			}
		}

		// Non-secret resource for comparison.
		label, err := random.NewRandomPet(ctx, "label", &random.RandomPetArgs{
			Length: pulumi.Int(2),
		})
		if err != nil {
			return err
		}

		// Stack outputs — mix of secret and non-secret.
		ctx.Export("dbHost", pulumi.String(dbHost))
		ctx.Export("label", label.ID())

		// Secret outputs — these require batch-decrypt to read back.
		ctx.Export("adminPassword", adminPass.Result)
		ctx.Export("userPassword", userPass.Result)
		ctx.Export("encryptionKeyB64", encKey.Base64)
		ctx.Export("signingKeyHex", signingKey.Hex)

		// Explicitly secret output via ToSecret.
		ctx.Export("manualSecret", pulumi.ToSecret(pulumi.String("this-is-manually-marked-secret")))

		return nil
	})
}
