angular
    .module('webApp')
    .controller('encuestaController', ['$scope', '$location', '$window', '$routeParams', 'session', 'Encuesta', encuestaController]);

function encuestaController($scope, $location, $window, $routeParams, session, Encuesta) {
    $window.scrollTo(0, 0);

    var vm = this;
    vm.numeroPrecarga = $routeParams.numeroPrecarga;
    vm.codigoParaServicios = $routeParams.codigoParaServicios;

    recaptchaCallback = function (token) {
        Encuesta.obtener(
            { RecaptchaResponse: token },
            function (data) {
                grecaptcha.reset();
                vm.encuesta = data.Encuesta;
                return;
            },
            function () {
                grecaptcha.reset();
            });
    };
    grecaptcha.execute();

    vm.submit = function () {
        vm.formErrors = [];

        var errors = editor.validate();
        if (!errors.length) {
            var respuestas = JSON.stringify(editor.getValue());

            recaptchaCallback = function (token) {
                Encuesta.guardar(
                    {
                        RecaptchaResponse: token,
                        respuestas: respuestas,
                        NumeroPrecarga: vm.numeroPrecarga,
                        CodigoParaServicios: vm.codigoParaServicios
                    },
                    function (data) {
                        grecaptcha.reset();
                        $location.path('/');
                        return;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();

        } else {
            editor.root.myShowValidationErrors(editor);
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}